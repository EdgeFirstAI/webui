// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
export class ArrayBufferHelper {
    static transfer(old_buffer, new_capacity) {
        const bytes = new Uint8Array(new ArrayBuffer(new_capacity));
        bytes.set(new Uint8Array(old_buffer.slice(0, new_capacity)));
        return bytes.buffer;
    }
}

export const getClassName = (obj) => {
    if (!obj || typeof obj != 'object') return null;
    return Object.prototype.toString.call(obj).slice('[object '.length, -1);
};

export const isUint8Array = (obj) => {
    return getClassName(obj) == 'Uint8Array';
};

export const isString = (obj) => {
    return typeof obj == 'string' || getClassName(obj) == 'String';
};

export const toTypedArray = (chunk, encoding, string_decoder) => {
    if (isString(chunk)) {
        chunk = string_decoder(encoding);
    }

    if (isUint8Array(chunk)) {
        return chunk;
    }
    else if (getClassName(chunk) == 'ArrayBuffer') {
        return new Uint8Array(chunk);
    }
    else if (Array.isArray(chunk)) {
        return new Uint8Array(chunk);
    }

    return null;
};

// NOTE: This function is Node.js specific and won't work in a browser environment
export const fromTypedArrayToBuffer = (typedArray) => {
    // In a browser, you might want to return the typed array as is
    // or use a different approach depending on your needs
    return typedArray;
};
