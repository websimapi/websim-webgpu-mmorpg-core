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
        this.staticMeshes = [];
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

        // Raycaster for click-to-move
        this.raycaster = new THREE.Raycaster();

        // Fallback Ground
        this.createGround(1024, 1024);

        // Handle Resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    // Raycast helper for input
    getInteractionPoint(clientX, clientY) {
        if (!this.ground || !this.camera) return null;
        
        const mouse = new THREE.Vector2();
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(mouse, this.camera);
        
        const intersects = this.raycaster.intersectObject(this.ground);
        if (intersects.length > 0) {
            return intersects[0].point;
        }
        return null;
    }

    async createGround(width, depth, chunkData = null) {
        // Cleanup old
        if(this.ground) {
            this.scene.remove(this.ground);
            if(this.ground.geometry) this.ground.geometry.dispose();
            if(this.ground.material) this.ground.material.dispose();
        }
        if(this.grid) {
            this.scene.remove(this.grid);
        }

        // Check for heightmap
        if (chunkData && chunkData.terrainMap && chunkData.terrainMap.type === 'image') {
            await this.createHeightmapTerrain(width, depth, chunkData.terrainMap);
        } else {
            // Fallback flat terrain
            const geo = new THREE.PlaneGeometry(width, depth, 128, 128);
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
        }

        // Visualize Regions if available
        if (chunkData && chunkData.regions) {
            chunkData.regions.forEach(region => {
                const b = region.bounds;
                const rGeo = new THREE.BoxGeometry(b.width, 100, b.depth);
                const rColor = region.pvp ? 0xff0000 : 0x00ff00;
                const rMat = new THREE.MeshBasicMaterial({ 
                    color: rColor, 
                    transparent: true, 
                    opacity: 0.05,
                    wireframe: true,
                    depthWrite: false
                });
                const rMesh = new THREE.Mesh(rGeo, rMat);
                rMesh.position.set(b.x + b.width/2, 50, b.z + b.depth/2);
                this.scene.add(rMesh);
            });
        }
    }

    async createHeightmapTerrain(width, depth, terrainConfig) {
        console.log("Renderer: Generating Heightmap Terrain...");
        const textureLoader = new THREE.TextureLoader();
        
        // Load Diffuse Texture
        let mapTexture = null;
        if (terrainConfig.texture) {
            mapTexture = await textureLoader.loadAsync(terrainConfig.texture);
            // High Density repetition for HD look
            mapTexture.wrapS = THREE.RepeatWrapping;
            mapTexture.wrapT = THREE.RepeatWrapping;
            mapTexture.repeat.set(64, 64);
            mapTexture.colorSpace = THREE.SRGBColorSpace;
        }

        // Load Heightmap Image
        const heightImage = await this.loadImage(terrainConfig.src);
        const { data, imgWidth, imgHeight } = this.getImageData(heightImage);

        // Create Geometry
        // Resolution matches image or capped for performance
        const segmentsW = 256; 
        const segmentsH = 256;
        const geometry = new THREE.PlaneGeometry(width, depth, segmentsW, segmentsH);
        geometry.rotateX(-Math.PI / 2);

        // Modify Vertices
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        const heightScale = terrainConfig.heightScale || 50;

        // Save height data for physics/gameplay lookups
        this.heightData = {
            width: segmentsW,
            depth: segmentsH,
            worldWidth: width,
            worldDepth: depth,
            scale: heightScale,
            grid: new Float32Array((segmentsW + 1) * (segmentsH + 1))
        };

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // Map vertex (x, z) to image UV
            // Vertex coords are centered around 0,0 in PlaneGeometry before we offset it later
            // x: -width/2 to width/2 -> 0 to 1
            // z: -depth/2 to depth/2 -> 0 to 1
            // (Note: PlaneGeometry is created on XY plane, then rotated. After rotation:
            // X is X, Y is -Z (depth). So we use x and z (which was y).
            
            const u = (vertex.x + width / 2) / width;
            const v = (vertex.z + depth / 2) / depth; // V is usually 1-y but let's see orientation

            // Sample image
            // v needs to be flipped because image coords are top-left usually, texture uv is bottom-left
            const px = Math.floor(u * (imgWidth - 1));
            const py = Math.floor((1 - v) * (imgHeight - 1));

            const pixelIndex = (py * imgWidth + px) * 4;
            const r = data[pixelIndex];
            
            // Normalize 0-255 -> 0-1
            const height = (r / 255) * heightScale;
            
            vertex.y = height;
            posAttribute.setY(i, height);

            // Store in our height grid for lookup
            // Mesh is rotated -90 X. 
            // We need to match the vertex index layout of PlaneGeometry
            this.heightData.grid[i] = height;
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: mapTexture ? 0xffffff : 0x556655,
            map: mapTexture,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.FrontSide
        });

        this.ground = new THREE.Mesh(geometry, material);
        // Position it so corner is at 0,0 like the game logic expects
        // PlaneGeometry center is 0,0. 
        this.ground.position.set(width / 2, 0, depth / 2);
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
        
        console.log("Renderer: Heightmap applied.");

        // Generate Grass
        this.generateGrass(width, depth);
    }

    generateGrass(width, depth) {
        console.log("Renderer: Generating dense grass...");
        const instanceCount = 40000;
        
        // Simple blade geometry (two intersecting planes)
        const geometry = new THREE.PlaneGeometry(0.8, 1.2);
        geometry.translate(0, 0.6, 0); // Pivot at bottom

        const material = new THREE.MeshStandardMaterial({
            color: 0x228822,
            roughness: 1.0,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });

        const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const _pos = new THREE.Vector3();
        const _scale = new THREE.Vector3();

        for (let i = 0; i < instanceCount; i++) {
            // Random position
            const x = Math.random() * width;
            const z = Math.random() * depth;
            
            // Get Height
            const y = this.getTerrainHeight(x, z);
            
            // Don't spawn under water (assuming water is at y=10ish) or too high on rocks
            if (y < 2 || y > 60) {
                 // Hide instance by scaling to 0
                 dummy.position.set(0, -100, 0);
                 dummy.scale.set(0,0,0);
            } else {
                dummy.position.set(x, y, z);
                dummy.rotation.y = Math.random() * Math.PI;
                // Random scale
                const s = 0.8 + Math.random() * 0.5;
                dummy.scale.set(s, s, s);
                // Random tilt
                dummy.rotation.x = (Math.random() - 0.5) * 0.2;
                dummy.rotation.z = (Math.random() - 0.5) * 0.2;
            }

            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            
            // Optional: Color variation
            if (i % 2 === 0) {
                 mesh.setColorAt(i, new THREE.Color(0x228822));
            } else {
                 mesh.setColorAt(i, new THREE.Color(0x339933));
            }
        }
        
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        
        this.scene.add(mesh);
        console.log("Renderer: Grass generated.");
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
            img.crossOrigin = 'Anonymous';
        });
    }

    getImageData(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return {
            data: ctx.getImageData(0, 0, image.width, image.height).data,
            imgWidth: image.width,
            imgHeight: image.height
        };
    }

    // Helper to get terrain height at world coordinates
    getTerrainHeight(x, z) {
        if (!this.ground || !this.heightData) return 0;
        
        // Transform world x,z to local 0..1
        // Ground is at width/2, depth/2. 
        // World 0 is at (groundPos.x - width/2)
        // Actually, we placed ground at (width/2, 0, depth/2)
        // So World 0,0 corresponds to left-bottom edge of plane geometry.
        
        const u = x / this.heightData.worldWidth;
        const v = z / this.heightData.worldDepth; // PlaneGeometry matches 1-v for Z usually due to texture coords

        if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

        // Bilinear interpolation or simple nearest for now
        // PlaneGeometry has segmentsW columns and segmentsH rows.
        // Vertices = (segmentsW + 1) * (segmentsH + 1)
        
        const gridW = this.heightData.width + 1;
        const gridH = this.heightData.depth + 1;
        
        const gx = u * (gridW - 1);
        const gy = (1 - v) * (gridH - 1); // Flip V to match loop above
        
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        
        // Clamp
        if (ix < 0 || ix >= gridW - 1 || iy < 0 || iy >= gridH - 1) return 0;

        // Get 4 neighbors from flat array
        // Row major? PlaneGeometry creates row by row.
        const i1 = iy * gridW + ix;
        const i2 = i1 + 1;
        const i3 = (iy + 1) * gridW + ix;
        const i4 = i3 + 1;

        const h1 = this.heightData.grid[i1];
        const h2 = this.heightData.grid[i2];
        const h3 = this.heightData.grid[i3];
        const h4 = this.heightData.grid[i4];
        
        const fx = gx - ix;
        const fy = gy - iy;

        // Simple bilinear
        const top = h1 * (1 - fx) + h2 * fx;
        const bottom = h3 * (1 - fx) + h4 * fx;
        
        return top * (1 - fy) + bottom * fy;
    }

    async setChunkData(data) {
        if (!data || !data.dimensions) return;
        console.log("Renderer: Applying Chunk Data", data);
        await this.createGround(data.dimensions.width, data.dimensions.depth, data);
        this.renderStaticObjects(data.staticObjects);
        
        // Update fog/background if specified
        if (data.environment && data.environment.ambientColor) {
            this.scene.background = new THREE.Color(data.environment.ambientColor);
            this.scene.fog = new THREE.FogExp2(data.environment.ambientColor, 0.0015);
        }
    }

    renderStaticObjects(objects) {
        // Cleanup old
        this.staticMeshes.forEach(mesh => this.scene.remove(mesh));
        this.staticMeshes = [];

        if (!objects || !Array.isArray(objects)) return;

        objects.forEach(obj => {
            let geo, mat;
            const color = obj.color || 0x888888;
            
            switch(obj.type) {
                case 'monolith':
                    geo = new THREE.BoxGeometry(obj.sx, obj.sy, obj.sz);
                    mat = new THREE.MeshStandardMaterial({ color: color, emissive: 0x00ff00, emissiveIntensity: 0.2 });
                    break;
                case 'tower':
                    geo = new THREE.CylinderGeometry(obj.sx/2, obj.sx/1.5, obj.sy, 8);
                    mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3 });
                    break;
                case 'tree':
                    geo = new THREE.ConeGeometry(obj.sx, obj.sy, 8);
                    mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 });
                    break;
                case 'arch':
                    geo = new THREE.TorusGeometry(obj.sx/2, obj.sz/2, 8, 16, Math.PI);
                    mat = new THREE.MeshStandardMaterial({ color: color });
                    break;
                default:
                    geo = new THREE.BoxGeometry(obj.sx, obj.sy, obj.sz);
                    mat = new THREE.MeshStandardMaterial({ color: color });
            }

            const mesh = new THREE.Mesh(geo, mat);
            // Objects are typically defined by bottom-center x,z. y is bottom.
            // But ThreeJS primitives are centered.
            let yOffset = obj.sy / 2;
            if (obj.type === 'arch') yOffset = 0; // Torus center is center

            mesh.position.set(obj.x, obj.y + yOffset, obj.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Special rotation for arch
            if (obj.type === 'arch') {
                mesh.rotation.x = 0; // Torus default lies flat-ish depending on implementation, let's adjust
                // TorusGeometry(radius, tube, radialSegments, tubularSegments, arc)
                // Default is in XY plane. We want it standing up.
            }

            this.scene.add(mesh);
            this.staticMeshes.push(mesh);
        });
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

