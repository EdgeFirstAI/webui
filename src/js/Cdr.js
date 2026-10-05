/*! @foxglove/cdr 3.5.1 (MIT), https://registry.npmjs.org/@foxglove/cdr/-/cdr-3.5.1.tgz, bundled as an ES module with esbuild 0.28.2 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/@foxglove/cdr/dist/EncapsulationKind.js
var require_EncapsulationKind = __commonJS({
  "node_modules/@foxglove/cdr/dist/EncapsulationKind.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EncapsulationKind = void 0;
    var EncapsulationKind2;
    (function(EncapsulationKind3) {
      EncapsulationKind3[EncapsulationKind3["CDR_BE"] = 0] = "CDR_BE";
      EncapsulationKind3[EncapsulationKind3["CDR_LE"] = 1] = "CDR_LE";
      EncapsulationKind3[EncapsulationKind3["PL_CDR_BE"] = 2] = "PL_CDR_BE";
      EncapsulationKind3[EncapsulationKind3["PL_CDR_LE"] = 3] = "PL_CDR_LE";
      EncapsulationKind3[EncapsulationKind3["CDR2_BE"] = 16] = "CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["CDR2_LE"] = 17] = "CDR2_LE";
      EncapsulationKind3[EncapsulationKind3["PL_CDR2_BE"] = 18] = "PL_CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["PL_CDR2_LE"] = 19] = "PL_CDR2_LE";
      EncapsulationKind3[EncapsulationKind3["DELIMITED_CDR2_BE"] = 20] = "DELIMITED_CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["DELIMITED_CDR2_LE"] = 21] = "DELIMITED_CDR2_LE";
      EncapsulationKind3[EncapsulationKind3["RTPS_CDR2_BE"] = 6] = "RTPS_CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["RTPS_CDR2_LE"] = 7] = "RTPS_CDR2_LE";
      EncapsulationKind3[EncapsulationKind3["RTPS_DELIMITED_CDR2_BE"] = 8] = "RTPS_DELIMITED_CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["RTPS_DELIMITED_CDR2_LE"] = 9] = "RTPS_DELIMITED_CDR2_LE";
      EncapsulationKind3[EncapsulationKind3["RTPS_PL_CDR2_BE"] = 10] = "RTPS_PL_CDR2_BE";
      EncapsulationKind3[EncapsulationKind3["RTPS_PL_CDR2_LE"] = 11] = "RTPS_PL_CDR2_LE";
    })(EncapsulationKind2 || (exports.EncapsulationKind = EncapsulationKind2 = {}));
  }
});

// node_modules/@foxglove/cdr/dist/getEncapsulationKindInfo.js
var require_getEncapsulationKindInfo = __commonJS({
  "node_modules/@foxglove/cdr/dist/getEncapsulationKindInfo.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getEncapsulationKindInfo = void 0;
    var EncapsulationKind_1 = require_EncapsulationKind();
    var getEncapsulationKindInfo = (kind) => {
      const isCDR2 = kind > EncapsulationKind_1.EncapsulationKind.PL_CDR_LE;
      const littleEndian = kind === EncapsulationKind_1.EncapsulationKind.CDR_LE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_LE || kind === EncapsulationKind_1.EncapsulationKind.CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_LE;
      const isDelimitedCDR2 = kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.DELIMITED_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_DELIMITED_CDR2_LE;
      const isPLCDR2 = kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR2_LE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_BE || kind === EncapsulationKind_1.EncapsulationKind.RTPS_PL_CDR2_LE;
      const isPLCDR1 = kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_BE || kind === EncapsulationKind_1.EncapsulationKind.PL_CDR_LE;
      const usesDelimiterHeader = isDelimitedCDR2 || isPLCDR2;
      const usesMemberHeader = isPLCDR2 || isPLCDR1;
      return {
        isCDR2,
        littleEndian,
        usesDelimiterHeader,
        usesMemberHeader
      };
    };
    exports.getEncapsulationKindInfo = getEncapsulationKindInfo;
  }
});

// node_modules/@foxglove/cdr/dist/isBigEndian.js
var require_isBigEndian = __commonJS({
  "node_modules/@foxglove/cdr/dist/isBigEndian.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isBigEndian = isBigEndian;
    var endianTestArray = new Uint8Array(4);
    var endianTestView = new Uint32Array(endianTestArray.buffer);
    endianTestView[0] = 1;
    function isBigEndian() {
      return endianTestArray[3] === 1;
    }
  }
});

// node_modules/@foxglove/cdr/dist/lengthCodes.js
var require_lengthCodes = __commonJS({
  "node_modules/@foxglove/cdr/dist/lengthCodes.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.lengthCodeToObjectSizes = void 0;
    exports.getLengthCodeForObjectSize = getLengthCodeForObjectSize;
    function getLengthCodeForObjectSize(objectSize) {
      let defaultLengthCode;
      switch (objectSize) {
        case 1:
          defaultLengthCode = 0;
          break;
        case 2:
          defaultLengthCode = 1;
          break;
        case 4:
          defaultLengthCode = 2;
          break;
        case 8:
          defaultLengthCode = 3;
          break;
      }
      if (defaultLengthCode == void 0) {
        if (objectSize > 4294967295) {
          throw Error(`Object size ${objectSize} for EMHEADER too large without specifying length code. Max size is ${4294967295}`);
        }
        defaultLengthCode = 4;
      }
      return defaultLengthCode;
    }
    exports.lengthCodeToObjectSizes = {
      0: 1,
      1: 2,
      2: 4,
      3: 8
    };
  }
});

// node_modules/@foxglove/cdr/dist/reservedPIDs.js
var require_reservedPIDs = __commonJS({
  "node_modules/@foxglove/cdr/dist/reservedPIDs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SENTINEL_PID = exports.EXTENDED_PID = void 0;
    exports.EXTENDED_PID = 16129;
    exports.SENTINEL_PID = 16130;
  }
});

// node_modules/@foxglove/cdr/dist/CdrReader.js
var require_CdrReader = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrReader.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrReader = void 0;
    var getEncapsulationKindInfo_1 = require_getEncapsulationKindInfo();
    var isBigEndian_1 = require_isBigEndian();
    var lengthCodes_1 = require_lengthCodes();
    var reservedPIDs_1 = require_reservedPIDs();
    var textDecoder = new TextDecoder("utf8");
    var CdrReader2 = class _CdrReader {
      get kind() {
        return this.view.getUint8(1);
      }
      get decodedBytes() {
        return this.offset;
      }
      get byteLength() {
        return this.view.byteLength;
      }
      constructor(data) {
        this.origin = 0;
        if (data.byteLength < 4) {
          throw new Error(`Invalid CDR data size ${data.byteLength}, must contain at least a 4-byte header`);
        }
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const kind = this.kind;
        const { isCDR2, littleEndian, usesDelimiterHeader, usesMemberHeader } = (0, getEncapsulationKindInfo_1.getEncapsulationKindInfo)(kind);
        this.usesDelimiterHeader = usesDelimiterHeader;
        this.usesMemberHeader = usesMemberHeader;
        this.littleEndian = littleEndian;
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        this.isCDR2 = isCDR2;
        this.eightByteAlignment = isCDR2 ? 4 : 8;
        this.origin = 4;
        this.offset = 4;
      }
      int8() {
        const value = this.view.getInt8(this.offset);
        this.offset += 1;
        return value;
      }
      uint8() {
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
      }
      int16() {
        this.align(2);
        const value = this.view.getInt16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
      }
      uint16() {
        this.align(2);
        const value = this.view.getUint16(this.offset, this.littleEndian);
        this.offset += 2;
        return value;
      }
      int32() {
        this.align(4);
        const value = this.view.getInt32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      uint32() {
        this.align(4);
        const value = this.view.getUint32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      int64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigInt64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      uint64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigUint64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      uint16BE() {
        this.align(2);
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
      }
      uint32BE() {
        this.align(4);
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
      }
      uint64BE() {
        this.align(this.eightByteAlignment);
        const value = this.view.getBigUint64(this.offset, false);
        this.offset += 8;
        return value;
      }
      float32() {
        this.align(4);
        const value = this.view.getFloat32(this.offset, this.littleEndian);
        this.offset += 4;
        return value;
      }
      float64() {
        this.align(this.eightByteAlignment);
        const value = this.view.getFloat64(this.offset, this.littleEndian);
        this.offset += 8;
        return value;
      }
      string(prereadLength) {
        const length = prereadLength ?? this.uint32();
        if (length <= 1) {
          this.offset += length;
          return "";
        }
        const data = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length - 1);
        const value = textDecoder.decode(data);
        this.offset += length;
        return value;
      }
      /** Reads the delimiter header which contains and returns the object size */
      dHeader() {
        const header = this.uint32();
        return header;
      }
      /**
       * Reads the member header (EMHEADER) and returns the member ID, mustUnderstand flag, and object size with optional length code
       * The length code is only present in CDR2 and should prompt objectSize to be used in place of sequence length if applicable.
       * See Extensible and Dynamic Topic Types (DDS-XTypes) v1.3 @ `7.4.3.4.2` for more info about CDR2 EMHEADER composition.
       * If a sentinelHeader was read (PL_CDR v1), the readSentinelHeader flag is set to true.
       */
      emHeader() {
        if (this.isCDR2) {
          return this.memberHeaderV2();
        } else {
          return this.memberHeaderV1();
        }
      }
      /** XCDR1 PL_CDR encapsulation parameter header*/
      memberHeaderV1() {
        this.align(4);
        const idHeader = this.uint16();
        const mustUnderstandFlag = (idHeader & 16384) >> 14 === 1;
        const implementationSpecificFlag = (idHeader & 32768) >> 15 === 1;
        const extendedPIDFlag = (idHeader & 16383) === reservedPIDs_1.EXTENDED_PID;
        const sentinelPIDFlag = (idHeader & 16383) === reservedPIDs_1.SENTINEL_PID;
        if (sentinelPIDFlag) {
          this.uint16();
          return { id: reservedPIDs_1.SENTINEL_PID, objectSize: 0, mustUnderstand: false, readSentinelHeader: true };
        }
        const usesReservedParameterId = (idHeader & 16383) > reservedPIDs_1.SENTINEL_PID;
        if (usesReservedParameterId || implementationSpecificFlag) {
          throw new Error(`Unsupported parameter ID header ${idHeader.toString(16)}`);
        }
        if (extendedPIDFlag) {
          this.uint16();
        }
        const id = extendedPIDFlag ? this.uint32() : idHeader & 16383;
        const objectSize = extendedPIDFlag ? this.uint32() : this.uint16();
        this.resetOrigin();
        return { id, objectSize, mustUnderstand: mustUnderstandFlag };
      }
      /** Sets the origin to the offset (DDS-XTypes Spec: `PUSH(ORIGIN = 0)`)*/
      resetOrigin() {
        this.origin = this.offset;
      }
      /** Reads boolean flag for optional members in CDR2
       * Will throw an error if called for CDR1.
       */
      isPresentFlag() {
        if (!this.isCDR2) {
          throw new Error("isPresentFlag is only supported for CDR2");
        }
        const isPresent = Boolean(this.uint8());
        return isPresent;
      }
      /** Reads the PID_SENTINEL value if encapsulation kind supports it (PL_CDR version 1)
       * @returns true if the sentinel header was read, false otherwise
       */
      sentinelHeader() {
        if (!this.isCDR2) {
          this.align(4);
          const header = this.uint16();
          const sentinelPIDFlag = (header & 16383) === reservedPIDs_1.SENTINEL_PID;
          if (!sentinelPIDFlag) {
            return false;
          }
          this.uint16();
          return true;
        } else {
          return false;
        }
      }
      memberHeaderV2() {
        const header = this.uint32();
        const mustUnderstand = Math.abs((header & 2147483648) >> 31) === 1;
        const lengthCode = (header & 1879048192) >> 28;
        const id = header & 268435455;
        const objectSize = this.emHeaderObjectSize(lengthCode);
        return { mustUnderstand, id, objectSize, lengthCode };
      }
      /** Uses the length code to derive the member object size in
       * the EMHEADER, sometimes reading NEXTINT (the next uint32
       * following the header) from the buffer */
      emHeaderObjectSize(lengthCode) {
        switch (lengthCode) {
          case 0:
          case 1:
          case 2:
          case 3:
            return lengthCodes_1.lengthCodeToObjectSizes[lengthCode];
          // LC > 3 -> NEXTINT exists after header
          case 4:
          case 5:
            return this.uint32();
          case 6:
            return 4 * this.uint32();
          case 7:
            return 8 * this.uint32();
          default:
            throw new Error(
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Invalid length code ${lengthCode} in EMHEADER at offset ${this.offset - 4}`
            );
        }
      }
      sequenceLength() {
        return this.uint32();
      }
      int8Array(count = this.sequenceLength()) {
        const array = new Int8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
      }
      uint8Array(count = this.sequenceLength()) {
        const array = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
        this.offset += count;
        return array;
      }
      int16Array(count = this.sequenceLength()) {
        return this.typedArray(Int16Array, "getInt16", count);
      }
      uint16Array(count = this.sequenceLength()) {
        return this.typedArray(Uint16Array, "getUint16", count);
      }
      int32Array(count = this.sequenceLength()) {
        return this.typedArray(Int32Array, "getInt32", count);
      }
      uint32Array(count = this.sequenceLength()) {
        return this.typedArray(Uint32Array, "getUint32", count);
      }
      int64Array(count = this.sequenceLength()) {
        return this.typedArray(BigInt64Array, "getBigInt64", count, this.eightByteAlignment);
      }
      uint64Array(count = this.sequenceLength()) {
        return this.typedArray(BigUint64Array, "getBigUint64", count, this.eightByteAlignment);
      }
      float32Array(count = this.sequenceLength()) {
        return this.typedArray(Float32Array, "getFloat32", count);
      }
      float64Array(count = this.sequenceLength()) {
        return this.typedArray(Float64Array, "getFloat64", count, this.eightByteAlignment);
      }
      stringArray(count = this.sequenceLength()) {
        const output = [];
        for (let i = 0; i < count; i++) {
          output.push(this.string());
        }
        return output;
      }
      /**
       * Seek the current read pointer a number of bytes relative to the current position. Note that
       * seeking before the four-byte header is invalid
       * @param relativeOffset A positive or negative number of bytes to seek
       */
      seek(relativeOffset) {
        const newOffset = this.offset + relativeOffset;
        if (newOffset < 4 || newOffset > this.view.byteLength) {
          throw new Error(`seek(${relativeOffset}) failed, ${newOffset} is outside the data range`);
        }
        this.offset = newOffset;
      }
      /**
       * Seek to an absolute byte position in the data. Note that seeking before the four-byte header is
       * invalid
       * @param offset An absolute byte offset in the range of [4-byteLength)
       */
      seekTo(offset) {
        if (offset < 4 || offset > this.view.byteLength) {
          throw new Error(`seekTo(${offset}) failed, value is outside the data range`);
        }
        this.offset = offset;
      }
      /**
       * Duplicate this reader. The underlying buffer is reused and not copied.
       */
      clone() {
        const clone = new _CdrReader(this.view);
        clone.offset = this.offset;
        clone.origin = this.origin;
        return clone;
      }
      /**
       * Limit the reader to a given number of bytes.
       * @param length The number of bytes to limit the reader to.
       */
      limit(length) {
        const newByteLength = this.offset + length;
        if (newByteLength <= this.view.byteLength) {
          this.view = new DataView(this.view.buffer, this.view.byteOffset, newByteLength);
        } else {
          throw new RangeError(`length ${length} exceeds byte length of view`);
        }
      }
      /**
       * Returns `true` if the reader is at the end of the buffer, or `false` otherwise.
       */
      isAtEnd() {
        return this.offset >= this.view.byteLength;
      }
      align(size) {
        const alignment = (this.offset - this.origin) % size;
        if (alignment > 0) {
          this.offset += size - alignment;
        }
      }
      // Reads a given count of numeric values into a typed array.
      typedArray(TypedArrayConstructor, getter, count, alignment = TypedArrayConstructor.BYTES_PER_ELEMENT) {
        if (count === 0) {
          return new TypedArrayConstructor();
        }
        this.align(alignment);
        const totalOffset = this.view.byteOffset + this.offset;
        if (this.littleEndian !== this.hostLittleEndian) {
          return this.typedArraySlow(TypedArrayConstructor, getter, count);
        } else if (totalOffset % TypedArrayConstructor.BYTES_PER_ELEMENT === 0) {
          const array = new TypedArrayConstructor(this.view.buffer, totalOffset, count);
          this.offset += TypedArrayConstructor.BYTES_PER_ELEMENT * count;
          return array;
        } else {
          return this.typedArrayUnaligned(TypedArrayConstructor, getter, count);
        }
      }
      typedArrayUnaligned(TypedArrayConstructor, getter, count) {
        if (count < 10) {
          return this.typedArraySlow(TypedArrayConstructor, getter, count);
        }
        const byteLength = TypedArrayConstructor.BYTES_PER_ELEMENT * count;
        const copy = new Uint8Array(byteLength);
        copy.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, byteLength));
        this.offset += byteLength;
        return new TypedArrayConstructor(copy.buffer, copy.byteOffset, count);
      }
      typedArraySlow(TypedArrayConstructor, getter, count) {
        const array = new TypedArrayConstructor(count);
        let offset = this.offset;
        for (let i = 0; i < count; i++) {
          array[i] = this.view[getter](offset, this.littleEndian);
          offset += TypedArrayConstructor.BYTES_PER_ELEMENT;
        }
        this.offset = offset;
        return array;
      }
    };
    exports.CdrReader = CdrReader2;
  }
});

// node_modules/@foxglove/cdr/dist/CdrSizeCalculator.js
var require_CdrSizeCalculator = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrSizeCalculator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrSizeCalculator = void 0;
    var CdrSizeCalculator2 = class {
      constructor() {
        this.offset = 4;
      }
      get size() {
        return this.offset;
      }
      int8() {
        return this.incrementAndReturn(1);
      }
      uint8() {
        return this.incrementAndReturn(1);
      }
      int16() {
        return this.incrementAndReturn(2);
      }
      uint16() {
        return this.incrementAndReturn(2);
      }
      int32() {
        return this.incrementAndReturn(4);
      }
      uint32() {
        return this.incrementAndReturn(4);
      }
      int64() {
        return this.incrementAndReturn(8);
      }
      uint64() {
        return this.incrementAndReturn(8);
      }
      float32() {
        return this.incrementAndReturn(4);
      }
      float64() {
        return this.incrementAndReturn(8);
      }
      string(length) {
        this.uint32();
        this.offset += length + 1;
        return this.offset;
      }
      sequenceLength() {
        return this.uint32();
      }
      // Increments the offset by `byteCount` and any required padding bytes and
      // returns the new offset
      incrementAndReturn(byteCount) {
        const alignment = (this.offset - 4) % byteCount;
        if (alignment > 0) {
          this.offset += byteCount - alignment;
        }
        this.offset += byteCount;
        return this.offset;
      }
    };
    exports.CdrSizeCalculator = CdrSizeCalculator2;
  }
});

// node_modules/@foxglove/cdr/dist/CdrWriter.js
var require_CdrWriter = __commonJS({
  "node_modules/@foxglove/cdr/dist/CdrWriter.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CdrWriter = void 0;
    var EncapsulationKind_1 = require_EncapsulationKind();
    var getEncapsulationKindInfo_1 = require_getEncapsulationKindInfo();
    var isBigEndian_1 = require_isBigEndian();
    var lengthCodes_1 = require_lengthCodes();
    var reservedPIDs_1 = require_reservedPIDs();
    var textEncoder = new TextEncoder();
    function stringLengthUtf8(str) {
      let byteLength = 0;
      const numCodeUnits = str.length;
      for (let i = 0; i < numCodeUnits; i++) {
        const codeUnit = str.charCodeAt(i);
        if (codeUnit <= 127) {
          byteLength += 1;
        } else if (codeUnit <= 2047) {
          byteLength += 2;
        } else if (55296 <= codeUnit && codeUnit <= 56319) {
          const nextCodeUnit = str.charCodeAt(i + 1);
          if (56320 <= nextCodeUnit && nextCodeUnit <= 57343) {
            byteLength += 4;
            i++;
          } else {
            byteLength += 3;
          }
        } else {
          byteLength += 3;
        }
      }
      return byteLength;
    }
    var CdrWriter2 = class _CdrWriter {
      get data() {
        return new Uint8Array(this.buffer, 0, this.offset);
      }
      get size() {
        return this.offset;
      }
      get kind() {
        return this.view.getUint8(1);
      }
      constructor(options = {}) {
        if (options.buffer != void 0) {
          this.buffer = options.buffer;
        } else if (options.size != void 0) {
          this.buffer = new ArrayBuffer(options.size);
        } else {
          this.buffer = new ArrayBuffer(_CdrWriter.DEFAULT_CAPACITY);
        }
        const kind = options.kind ?? EncapsulationKind_1.EncapsulationKind.CDR_LE;
        const { isCDR2, littleEndian } = (0, getEncapsulationKindInfo_1.getEncapsulationKindInfo)(kind);
        this.isCDR2 = isCDR2;
        this.littleEndian = littleEndian;
        this.hostLittleEndian = !(0, isBigEndian_1.isBigEndian)();
        this.eightByteAlignment = isCDR2 ? 4 : 8;
        this.array = new Uint8Array(this.buffer);
        this.view = new DataView(this.buffer);
        this.resizeIfNeeded(4);
        this.view.setUint8(0, 0);
        this.view.setUint8(1, kind);
        this.view.setUint16(2, 0, false);
        this.offset = 4;
        this.origin = 4;
      }
      int8(value) {
        this.resizeIfNeeded(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
        return this;
      }
      uint8(value) {
        this.resizeIfNeeded(1);
        this.view.setUint8(this.offset, value);
        this.offset += 1;
        return this;
      }
      int16(value) {
        this.align(2);
        this.view.setInt16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
      }
      uint16(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, this.littleEndian);
        this.offset += 2;
        return this;
      }
      int32(value) {
        this.align(4);
        this.view.setInt32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      uint32(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      int64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigInt64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      uint64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigUint64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      uint16BE(value) {
        this.align(2);
        this.view.setUint16(this.offset, value, false);
        this.offset += 2;
        return this;
      }
      uint32BE(value) {
        this.align(4);
        this.view.setUint32(this.offset, value, false);
        this.offset += 4;
        return this;
      }
      uint64BE(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setBigUint64(this.offset, value, false);
        this.offset += 8;
        return this;
      }
      float32(value) {
        this.align(4);
        this.view.setFloat32(this.offset, value, this.littleEndian);
        this.offset += 4;
        return this;
      }
      float64(value) {
        this.align(this.eightByteAlignment, 8);
        this.view.setFloat64(this.offset, value, this.littleEndian);
        this.offset += 8;
        return this;
      }
      // writeLength optional because it could already be included in a header
      string(value, writeLength = true) {
        const strlen = stringLengthUtf8(value);
        if (writeLength) {
          this.uint32(strlen + 1);
        }
        this.resizeIfNeeded(strlen + 1);
        textEncoder.encodeInto(value, new Uint8Array(this.buffer, this.offset, strlen));
        this.view.setUint8(this.offset + strlen, 0);
        this.offset += strlen + 1;
        return this;
      }
      /** Writes the delimiter header using object size
       * NOTE: changing endian-ness with a single CDR message is not supported
       */
      dHeader(objectSize) {
        const header = objectSize;
        this.uint32(header);
        return this;
      }
      /**
       * Writes the member header (EMHEADER)
       * Accomodates for PL_CDR and PL_CDR2 based on the CdrWriter constructor options
       *
       * @param mustUnderstand - Whether the member is required to be understood by the receiver
       * @param id - The member ID
       * @param objectSize - The size of the member in bytes
       * @param lengthCode - Optional length code for CDR2 emHeaders.
       * lengthCode values [5-7] allow the emHeader object size to take the place of the normally encoded member length.
       *
       * NOTE: Dynamically determines default value if not provided that does not affect serialization ie will use lengthCode values [0-4].
       *
       * From Extensible and Dynamic Topic Types in DDS-XTypes v1.3 @ `7.4.3.4.2`:
       * "EMHEADER1 with LC values 5 to 7 also affect the serialization/deserialization virtual machine in that they cause NEXTINT to be
       * reused also as part of the serialized member. This is useful because the serialization of certain members also starts with an
       * integer length, which would take exactly the same value as NEXTINT. Therefore the use of length codes 5 to 7 saves 4 bytes in
       * the serialization."
       * @returns - CdrWriter instance
       */
      emHeader(mustUnderstand, id, objectSize, lengthCode) {
        return this.isCDR2 ? this.memberHeaderV2(mustUnderstand, id, objectSize, lengthCode) : this.memberHeaderV1(mustUnderstand, id, objectSize);
      }
      memberHeaderV1(mustUnderstand, id, objectSize) {
        this.align(4);
        const mustUnderstandFlag = mustUnderstand ? 1 << 14 : 0;
        const shouldUseExtendedPID = id > 16128 || objectSize > 65535;
        if (!shouldUseExtendedPID) {
          const idHeader = mustUnderstandFlag | id;
          this.uint16(idHeader);
          const objectSizeHeader = objectSize & 65535;
          this.uint16(objectSizeHeader);
        } else {
          const extendedHeader = mustUnderstandFlag | reservedPIDs_1.EXTENDED_PID;
          this.uint16(extendedHeader);
          this.uint16(8);
          this.uint32(id);
          this.uint32(objectSize);
        }
        this.resetOrigin();
        return this;
      }
      /** Sets the origin to the offset (DDS-XTypes Spec: `PUSH(ORIGIN = 0)`)*/
      resetOrigin() {
        this.origin = this.offset;
      }
      /** Writes boolean flag for optional members in CDR2
       * @throws Error if called for CDR1.
       */
      presentFlag(value) {
        if (!this.isCDR2) {
          throw new Error("presentFlag is only supported for CDR2");
        }
        this.uint8(value ? 1 : 0);
        return this;
      }
      /** Writes the PID_SENTINEL value if encapsulation supports it*/
      sentinelHeader() {
        if (!this.isCDR2) {
          this.align(4);
          this.uint16(reservedPIDs_1.SENTINEL_PID);
          this.uint16(0);
        }
        return this;
      }
      memberHeaderV2(mustUnderstand, id, objectSize, lengthCode) {
        if (id > 268435455) {
          throw Error(`Member ID ${id} is too large. Max value is ${268435455}`);
        }
        const mustUnderstandFlag = mustUnderstand ? 1 << 31 : 0;
        const finalLengthCode = lengthCode ?? (0, lengthCodes_1.getLengthCodeForObjectSize)(objectSize);
        const header = mustUnderstandFlag | finalLengthCode << 28 | id;
        this.uint32(header);
        switch (finalLengthCode) {
          case 0:
          case 1:
          case 2:
          case 3: {
            const shouldBeSize = lengthCodes_1.lengthCodeToObjectSizes[finalLengthCode];
            if (objectSize !== shouldBeSize) {
              throw new Error(`Cannot write a length code ${finalLengthCode} header with an object size not equal to ${shouldBeSize}`);
            }
            break;
          }
          // When the length code is > 3 the header is 8 bytes because of the NEXTINT value storing the object size
          case 4:
          case 5:
            this.uint32(objectSize);
            break;
          case 6:
            if (objectSize % 4 !== 0) {
              throw new Error("Cannot write a length code 6 header with an object size that is not a multiple of 4");
            }
            this.uint32(objectSize >> 2);
            break;
          case 7:
            if (objectSize % 8 !== 0) {
              throw new Error("Cannot write a length code 7 header with an object size that is not a multiple of 8");
            }
            this.uint32(objectSize >> 3);
            break;
          default:
            throw new Error(`Unexpected length code ${finalLengthCode}`);
        }
        return this;
      }
      sequenceLength(value) {
        return this.uint32(value);
      }
      int8Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
      }
      uint8Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        this.resizeIfNeeded(value.length);
        this.array.set(value, this.offset);
        this.offset += value.length;
        return this;
      }
      int16Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Int16Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int16(entry);
          }
        }
        return this;
      }
      uint16Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Uint16Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint16(entry);
          }
        }
        return this;
      }
      int32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Int32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int32(entry);
          }
        }
        return this;
      }
      uint32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Uint32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint32(entry);
          }
        }
        return this;
      }
      int64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof BigInt64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.int64(BigInt(entry));
          }
        }
        return this;
      }
      uint64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof BigUint64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.uint64(BigInt(entry));
          }
        }
        return this;
      }
      float32Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Float32Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.float32(entry);
          }
        }
        return this;
      }
      float64Array(value, writeLength) {
        if (writeLength === true) {
          this.sequenceLength(value.length);
        }
        if (value instanceof Float64Array && this.littleEndian === this.hostLittleEndian && value.length >= _CdrWriter.BUFFER_COPY_THRESHOLD) {
          this.align(value.BYTES_PER_ELEMENT, value.byteLength);
          this.array.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), this.offset);
          this.offset += value.byteLength;
        } else {
          for (const entry of value) {
            this.float64(entry);
          }
        }
        return this;
      }
      /**
       * Calculate the capacity needed to hold the given number of aligned bytes,
       * resize if needed, and write padding bytes for alignment
       * @param size Byte width to align to. If the current offset is 1 and `size`
       *   is 4, 3 bytes of padding will be written
       * @param bytesToWrite Optional, total amount of bytes that are intended to be
       *   written directly following the alignment. This can be used to avoid
       *   additional buffer resizes in the case of writing large blocks of aligned
       *   data such as arrays
       */
      align(size, bytesToWrite = size) {
        const alignment = (this.offset - this.origin) % size;
        const padding = alignment > 0 ? size - alignment : 0;
        this.resizeIfNeeded(padding + bytesToWrite);
        this.array.fill(0, this.offset, this.offset + padding);
        this.offset += padding;
      }
      resizeIfNeeded(additionalBytes) {
        const capacity = this.offset + additionalBytes;
        if (this.buffer.byteLength < capacity) {
          const doubled = this.buffer.byteLength * 2;
          const newCapacity = doubled > capacity ? doubled : capacity;
          this.resize(newCapacity);
        }
      }
      resize(capacity) {
        if (this.buffer.byteLength >= capacity) {
          return;
        }
        const buffer = new ArrayBuffer(capacity);
        const array = new Uint8Array(buffer);
        array.set(this.array);
        this.buffer = buffer;
        this.array = array;
        this.view = new DataView(buffer);
      }
    };
    exports.CdrWriter = CdrWriter2;
    CdrWriter2.DEFAULT_CAPACITY = 16;
    CdrWriter2.BUFFER_COPY_THRESHOLD = 10;
  }
});

// node_modules/@foxglove/cdr/dist/index.js
var require_dist = __commonJS({
  "node_modules/@foxglove/cdr/dist/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_CdrReader(), exports);
    __exportStar(require_CdrSizeCalculator(), exports);
    __exportStar(require_CdrWriter(), exports);
    __exportStar(require_EncapsulationKind(), exports);
  }
});

// entry.mjs
var import_cdr = __toESM(require_dist(), 1);
var { CdrReader, CdrSizeCalculator, CdrWriter, EncapsulationKind } = import_cdr.default;
var entry_default = import_cdr.default;
export {
  CdrReader,
  CdrSizeCalculator,
  CdrWriter,
  EncapsulationKind,
  entry_default as default
};
