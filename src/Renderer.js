import * as THREE from 'three';

export class Renderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.playerMesh = null;
        this.peerMeshes = {};
        this.ground = null;
        this.grid = null;
    }

    init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error("Renderer: Container not found");
            return;
        }

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, 0.002);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 10, 20);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6); // Soft white light
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(100, 200, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        const d = 100;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);

        // Player (Simple Capsule/Box)
        const pGeo = new THREE.BoxGeometry(1, 2, 1);
        const pMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        this.playerMesh = new THREE.Mesh(pGeo, pMat);
        this.playerMesh.castShadow = true;
        this.scene.add(this.playerMesh);

        // Initial Ground (Will be replaced or augmented by chunks)
        this.createGround(1024, 1024);

        // Handle Resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    createGround(width, depth) {
        if(this.ground) this.scene.remove(this.ground);
        if(this.grid) this.scene.remove(this.grid);
        
        const geo = new THREE.PlaneGeometry(width, depth);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a, 
            roughness: 0.9, 
            metalness: 0.1 
        });
        this.ground = new THREE.Mesh(geo, mat);
        this.ground.rotation.x = -Math.PI / 2;
        // The spawn chunk terrain map implies a world coordinate system.
        // If spawn is at 512, 512, and width is 1024, the chunk is likely 0 to 1024.
        // PlaneGeometry creates centered at local 0,0.
        // So we move it to width/2, depth/2 to cover 0..1024
        this.ground.position.set(width/2, 0, depth/2); 
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Helper Grid
        this.grid = new THREE.GridHelper(width, 64, 0x00ff00, 0x111111);
        this.grid.position.set(width/2, 0.1, depth/2);
        this.scene.add(this.grid);
    }

    onWindowResize() {
        if(!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update(player, peers, myClientId) {
        if (!this.playerMesh || !this.scene) return;

        // Sync Player
        this.playerMesh.position.set(player.position.x, player.position.y + 1, player.position.z);
        // Box is 2 units high, center is at 0,0,0 local. If pos is feet, we lift by 1.
        
        // Camera Follow (Third Person) - Simple smooth follow
        const relativeCameraOffset = new THREE.Vector3(0, 15, 20); // Behind and up
        const targetPos = this.playerMesh.position.clone().add(relativeCameraOffset);
        this.camera.position.lerp(targetPos, 0.1);
        this.camera.lookAt(this.playerMesh.position);

        // Sync Peers
        this.syncPeers(peers, myClientId);
    }

    syncPeers(peers, myClientId) {
        // Filter out self if present in peers list
        const activeIds = new Set();
        
        for (const id in peers) {
            if (id === myClientId) continue;
            activeIds.add(id);
            
            const data = peers[id];
            
            // Create if missing
            if (!this.peerMeshes[id]) {
                const geo = new THREE.BoxGeometry(1, 2, 1);
                const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Peers are red
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                this.scene.add(mesh);
                this.peerMeshes[id] = mesh;
            }

            // Update
            const mesh = this.peerMeshes[id];
            if (data.pos) {
                mesh.position.set(data.pos.x, data.pos.y + 1, data.pos.z);
            }
        }

        // Cleanup Disconnected
        for (const id in this.peerMeshes) {
            if (!activeIds.has(id)) {
                this.scene.remove(this.peerMeshes[id]);
                delete this.peerMeshes[id];
            }
        }
    }
}

