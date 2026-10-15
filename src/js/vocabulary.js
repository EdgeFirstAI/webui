// Copyright (C) 2026 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Shared code tables read from EdgeFirst messages. Each table mirrors one
// vocabulary declared elsewhere; the webui never numbers a code itself.
// tests/unit/vocabulary.test.mjs checks every table against the snapshot in
// tests/unit/fixtures/vocabulary.json, and .github/scripts/vocabulary.sh
// regenerates or checks that snapshot from the pinned authority.

/**
 * `sensor_msgs/msg/PointField` datatype codes.
 *
 * Authority: edgefirst-schemas `sensor_msgs::point_field`, which carries the
 * ROS 2 `sensor_msgs/msg/PointField` constants.
 */
export const POINT_FIELD_DATATYPE = Object.freeze({
    INT8: 1,
    UINT8: 2,
    INT16: 3,
    UINT16: 4,
    INT32: 5,
    UINT32: 6,
    FLOAT32: 7,
    FLOAT64: 8,
})
