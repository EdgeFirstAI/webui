import {
    BufferGeometry,
    FileLoader,
    Float32BufferAttribute,
    Loader,
    Points,
    PointsMaterial,
    AdditiveBlending,
    LineBasicMaterial,
    CircleGeometry,
    LineLoop,
    Group,
    Vector3
} from './three.js';
import { parsePointCloud2, readField } from './pointcloud2.js';

class PCDLoader extends Loader {

    constructor(manager) {

        super(manager);

        this.littleEndian = true;

    }

    load(url, onLoad, onProgress, onError) {

        const scope = this;

        const loader = new FileLoader(scope.manager);
        loader.setPath(scope.path);
        loader.setResponseType('arraybuffer');
        loader.setRequestHeader(scope.requestHeader);
        loader.setWithCredentials(scope.withCredentials);
        loader.load(url, function (data) {

            try {

                onLoad(scope.parse(data));

            } catch (e) {

                if (onError) {

                    onError(e);

                } else {

                    console.error(e);

                }

                scope.manager.itemError(url);

            }

        }, onProgress, onError);

    }

    createRangeRings() {
        const rings = new Group();
        // const material = new LineBasicMaterial({ color: 0x404040 });

        // Create rings at 1m intervals up to 5m
        for (let radius = 1; radius <= 5; radius++) {
            const geometry = new CircleGeometry(radius, 64);
            // Remove center vertex
            const points = geometry.attributes.position;
            const circleGeom = new BufferGeometry().setFromPoints(
                Array.from({ length: points.count }, (_, i) => {
                    const vertex = new Vector3().fromBufferAttribute(points, i);
                    return vertex;
                }).filter((_, i) => i > 0) // Remove center vertex
            );
            // const circle = new LineLoop(circleGeom, material);
            // circle.rotation.x = -Math.PI / 2; // Lay flat
            // rings.add(circle);
        }
        return rings;
    }

    parse(data) {
        const parsed = parsePointCloud2(data);
        this.lastParsed = parsed;
        const { totalPoints, fieldMap } = parsed;

        // Bail out if essential x/y fields are missing
        const fx = fieldMap.x;
        const fy = fieldMap.y;
        if (!fx || !fy) return new Group();

        const fz = fieldMap.z; // may be undefined

        const positions = new Float32Array(totalPoints * 3);
        const colors = new Float32Array(totalPoints * 3);

        // First pass: read x/y, compute positions, and track max distance
        let maxDistance = 0;
        for (let i = 0; i < totalPoints; i++) {
            const x = readField(parsed, i, fx);
            const y = readField(parsed, i, fy);
            const z = fz ? readField(parsed, i, fz) : 0;

            // Axis remap: x forward, z up, -y right
            positions[i * 3]     = x;
            positions[i * 3 + 1] = z;
            positions[i * 3 + 2] = -y;

            const dist = Math.sqrt(x * x + y * y);
            if (dist > maxDistance) maxDistance = dist;
        }
        maxDistance = Math.max(maxDistance, 1e-3); // Avoid divide by zero

        // Second pass: rainbow color by distance
        for (let i = 0; i < totalPoints; i++) {
            const x = positions[i * 3];
            const y = -positions[i * 3 + 2]; // recover original y from -y
            const dist = Math.sqrt(x * x + y * y);
            const t = Math.min(dist / maxDistance, 1.0);
            const hue = (1.0 - t) * 240; // 0=red, 120=green, 240=blue
            const rgb = this.hsvToRgb(hue, 1.0, 1.0);
            colors[i * 3]     = rgb.r;
            colors[i * 3 + 1] = rgb.g;
            colors[i * 3 + 2] = rgb.b;
        }

        // Create geometry
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        // Create material
        const material = new PointsMaterial({
            size: 2,
            vertexColors: true,
            sizeAttenuation: false,
            transparent: true,
            opacity: 1.0,
            blending: AdditiveBlending
        });
        // Create points
        const group = new Group();
        const pointsObj = new Points(geometry, material);
        group.add(pointsObj);
        return group;
    }

    colorPointsByXValue(points) {
        const geometry = points.geometry;
        const positionAttribute = geometry.attributes.position;
        const numPoints = positionAttribute.count;
        const colors = new Float32Array(numPoints * 3);

        const maxDistance = 6.0;

        for (let i = 0; i < numPoints; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getZ(i);  // Z holds vertical in your setup
            const distance = Math.sqrt(x * x + y * y);

            // Normalize distance 0 to 1
            const t = Math.min(distance / maxDistance, 1.0);

            // Use HSV to RGB conversion for rainbow gradient
            const hue = (1.0 - t) * 240;  // 0 = red, 240 = blue
            const rgb = this.hsvToRgb(hue, 1.0, 1.0);

            colors[i * 3] = rgb.r;
            colors[i * 3 + 1] = rgb.g;
            colors[i * 3 + 2] = rgb.b;
        }

        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

        const mat = points.material;
        mat.vertexColors = true;
        mat.size = 3;
        mat.sizeAttenuation = false;
        mat.transparent = true;
        mat.opacity = 1.0;
        mat.blending = AdditiveBlending;
    }

    // HSV to RGB helper
    hsvToRgb(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        let r = 0, g = 0, b = 0;

        if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
        else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
        else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
        else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
        else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        return { r: r + m, g: g + m, b: b + m };
    }



}

export { PCDLoader };