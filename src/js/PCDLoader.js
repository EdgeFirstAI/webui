import {
    BufferGeometry,
    Color,
    FileLoader,
    Float32BufferAttribute,
    Int32BufferAttribute,
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
import { CdrReader } from './Cdr.js';

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
        // Use pcd.js logic for flexible parsing
        const dataView = new DataView(data);
        const reader = new CdrReader(dataView);

        // --- Begin pcd.js logic ---
        function deserialize_pointfield(reader) {
            const pointfield = {};
            pointfield.name = reader.string();
            pointfield.offset = reader.uint32();
            pointfield.datatype = reader.uint8();
            pointfield.count = reader.uint32();
            return pointfield;
        }

        function deserialize_pcd(reader) {
            const data = {};
            data.header_stamp_sec = reader.uint32();
            data.header_stamp_nsec = reader.uint32();
            data.header_frame_id = reader.string();

            data.height = reader.uint32();
            data.width = reader.uint32();

            const field_count = reader.sequenceLength();
            data.fields = [];
            for (let i = 0; i < field_count; i++) {
                data.fields.push(deserialize_pointfield(reader));
            }

            data.is_bigendian = reader.int8() > 0;
            data.point_step = reader.uint32();
            data.row_step = reader.uint32();
            data.data = reader.uint8Array();
            data.is_dense = reader.int8() > 0;
            return data;
        }

        function pcd_to_points(pcd) {
            const points = [];
            const view = new DataView(new ArrayBuffer(pcd.data.length));
            pcd.data.forEach((b, i) => view.setUint8(i, b));
            for (let i = 0; i < pcd.height; i++) {
                for (let j = 0; j < pcd.width; j++) {
                    const point = {};
                    const point_start = (i * pcd.width + j) * pcd.point_step;
                    for (const f of pcd.fields) {
                        let val = 0;
                        switch (f.datatype) {
                            case 7: // float32
                                val = view.getFloat32(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            case 8: // float64
                                val = view.getFloat64(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            case 2: // uint8
                                val = view.getUint8(point_start + f.offset);
                                break;
                            case 1: // int8
                                val = view.getInt8(point_start + f.offset);
                                break;
                            case 3: // int16
                                val = view.getInt16(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            case 4: // uint16
                                val = view.getUint16(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            case 5: // int32
                                val = view.getInt32(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            case 6: // uint32
                                val = view.getUint32(point_start + f.offset, !pcd.is_bigendian);
                                break;
                            default:
                                console.warn("NotImplemented: PCD has unknown data type.", f.datatype);
                        }
                        point[f.name] = val;
                    }
                    points.push(point);
                }
            }
            return points;
        }
        // --- End pcd.js logic ---

        // Parse the PCD
        const pcd = deserialize_pcd(reader);
        const points = pcd_to_points(pcd);

        // Now convert to Three.js geometry
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);

        // Find max distance for normalization
        let maxDistance = 0;
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const x = pt.x;
            const y = pt.y;
            const dist = Math.sqrt(x * x + y * y);
            if (dist > maxDistance) maxDistance = dist;
        }
        maxDistance = Math.max(maxDistance, 1e-3); // Avoid divide by zero

        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            // Assume x, y, z fields exist
            positions[i * 3] = pt.x;
            positions[i * 3 + 1] = pt.z !== undefined ? pt.z : 0;
            positions[i * 3 + 2] = -pt.y;

            // Rainbow color by distance
            const x = pt.x;
            const y = pt.y;
            const dist = Math.sqrt(x * x + y * y);
            const t = Math.min(dist / maxDistance, 1.0);
            const hue = (1.0 - t) * 240; // 0=red, 120=green, 240=blue
            const rgb = this.hsvToRgb(hue, 1.0, 1.0);
            colors[i * 3] = rgb.r;
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