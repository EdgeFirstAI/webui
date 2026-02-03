// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export function parseNumbersInObject(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = parseNumbersInObject(obj[key]);
        } else if (typeof obj[key] === 'string') {
            if (obj[key] === "true") {
                obj[key] = true
            } else if (obj[key] === "false") {
                obj[key] = false
            } else if (!isNaN(obj[key]) && obj[key].trim() !== '') {
                if (obj[key].includes('.')) {
                    obj[key] = parseFloat(obj[key]);
                } else {
                    obj[key] = parseInt(obj[key], 10);
                }
            }
        }
    }
    return obj;
}
