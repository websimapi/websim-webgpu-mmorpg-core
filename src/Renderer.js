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
        this.scene.fog = new THREE.FogExp2(0x050510, 0.0015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
        this.camera.position.set(0, 50, 50);

        // Renderer
        // NOTE: WebGPU support in Three.js r160 is experimental/addon. 
        // We use WebGLRenderer here for stability, but configure it for high performance.
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(500, 1000, 500); // Higher and more central for the map
        dirLight.castShadow = true;
        
        // Optimize shadow map for large terrain
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 2000;
        const d = 1000;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.bias = -0.0001;
        this.scene.add(dirLight);

        // Player (Capsule for better representation)
        const pGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        const pMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.2, metalness: 0.5 });
        this.playerMesh = new THREE.Mesh(pGeo, pMat);
        this.playerMesh.position.y = 1; // Half height
        this.playerMesh.castShadow = true;
        this.scene.add(this.playerMesh);

        // Fallback Ground
        this.createGround(1024, 1024);

        // Handle Resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    createGround(width, depth, chunkData = null) {
        // Cleanup old
        if(this.ground) {
            this.scene.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
        }
        if(this.grid) {
            this.scene.remove(this.grid);
        }
        
        // If chunk data provided, use it
        const color = chunkData && chunkData.environment ? chunkData.environment.ambientColor : 0x1a1a1a;
        
        // Terrain
        const geo = new THREE.PlaneGeometry(width, depth, 128, 128); // Higher segment count for vertex displacement if needed
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x222222, 
            roughness: 0.8, 
            metalness: 0.2,
            wireframe: false
        });
        
        this.ground = new THREE.Mesh(geo, mat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.set(width/2, 0, depth/2); 
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Grid (Subtle)
        this.grid = new THREE.GridHelper(width, 128, 0x444444, 0x111111);
        this.grid.position.set(width/2, 0.1, depth/2);
        this.scene.add(this.grid);

        // Visualize Regions if available
        if (chunkData && chunkData.regions) {
            chunkData.regions.forEach(region => {
                const b = region.bounds;
                // Regions are defined with x, z, width, depth.
                // Center of the box should be at x + w/2, z + d/2
                const rGeo = new THREE.BoxGeometry(b.width, 20, b.depth);
                const rColor = region.pvp ? 0xff0000 : 0x00ff00;
                const rMat = new THREE.MeshBasicMaterial({ 
                    color: rColor, 
                    transparent: true, 
                    opacity: 0.1,
                    wireframe: true
                });
                const rMesh = new THREE.Mesh(rGeo, rMat);
                // Position: x is corner in data, so + width/2
                rMesh.position.set(b.x + b.width/2, 10, b.z + b.depth/2);
                this.scene.add(rMesh);

                // Label (Console only for now)
                console.log(`Rendering Region: ${region.name} at [${b.x}, ${b.z}]`);
            });
        }
    }

    setChunkData(data) {
        if (!data || !data.dimensions) return;
        console.log("Renderer: Applying Chunk Data", data);
        this.createGround(data.dimensions.width, data.dimensions.depth, data);
        
        // Update fog/background if specified
        if (data.environment && data.environment.ambientColor) {
            this.scene.background = new THREE.Color(data.environment.ambientColor);
            this.scene.fog = new THREE.FogExp2(data.environment.ambientColor, 0.0015);
        }
    }

    onWindowResize() {
        if(!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update(player, peers, myClientId) {
        if (!this.playerMesh || !this.scene) return;

        // Sync Player Position
        // Note: Player position is the bottom center (feet). 
        // Capsule height is 2 (radius 0.5 + cylinder 1 + radius 0.5). Center is 0,0,0.
        // We lift by 1 (half height) to place feet at y.
        this.playerMesh.position.set(player.position.x, player.position.y + 1, player.position.z);
        
        // Camera Follow (Third Person)
        const relativeCameraOffset = new THREE.Vector3(0, 15, 25);
        const targetPos = this.playerMesh.position.clone().add(relativeCameraOffset);
        this.camera.position.lerp(targetPos, 0.1);
        this.camera.lookAt(this.playerMesh.position.x, this.playerMesh.position.y + 2, this.playerMesh.position.z);

        // Sync Peers
        this.syncPeers(peers, myClientId);

        // Render the scene (CRITICAL FIX: Scene was black because render() was missing)
        this.renderer.render(this.scene, this.camera);
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

