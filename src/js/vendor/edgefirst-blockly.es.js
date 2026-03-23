import * as m from "blockly/core";
import { pythonGenerator as i, Order as a } from "blockly/python";
const q = [
  {
    type: "edgefirst_zenoh_publish",
    message0: "publish %1 to %2",
    args0: [
      {
        type: "input_value",
        name: "DATA"
      },
      {
        type: "field_input",
        name: "TOPIC",
        text: "rt/custom/output"
      }
    ],
    previousStatement: null,
    nextStatement: null,
    style: "zenoh_blocks",
    tooltip: "Publish data to a zenoh topic",
    helpUrl: ""
  },
  {
    type: "edgefirst_zenoh_topic",
    message0: "%1",
    args0: [
      {
        type: "field_dropdown",
        name: "TOPIC",
        options: [
          ["Camera DMA", "rt/camera/dma"],
          ["Camera JPEG", "rt/camera/jpeg"],
          ["Model Boxes", "rt/model/boxes2d"],
          ["Model Mask", "rt/model/mask"],
          ["GPS", "rt/gps"],
          ["IMU", "rt/imu"]
        ]
      }
    ],
    output: "String",
    style: "zenoh_blocks",
    tooltip: "A zenoh topic path",
    helpUrl: ""
  }
];
let S = !1;
function Q() {
  S || (S = !0, m.common.defineBlocksWithJsonArray(q));
}
const u = [
  {
    label: "EdgeFirst",
    module: "edgefirst.schemas.edgefirst_msgs",
    types: [
      {
        label: "DMA Buffer",
        python: "DmaBuffer",
        defaultTopic: "rt/camera/dma",
        fields: [
          { label: "fd", python: "fd" },
          { label: "width", python: "width" },
          { label: "height", python: "height" },
          { label: "stride", python: "stride" },
          { label: "fourcc", python: "fourcc" },
          { label: "length", python: "length" },
          { label: "timestamp", python: "timestamp" }
        ]
      },
      {
        label: "Camera Info",
        python: "CameraInfo",
        defaultTopic: "rt/camera/info",
        fields: [
          { label: "width", python: "width" },
          { label: "height", python: "height" },
          { label: "fourcc", python: "fourcc" }
        ]
      },
      {
        label: "JPEG Frame",
        python: "JpegFrame",
        defaultTopic: "rt/camera/jpeg",
        fields: [
          { label: "data", python: "data" },
          { label: "width", python: "width" },
          { label: "height", python: "height" },
          { label: "timestamp", python: "timestamp" }
        ]
      },
      {
        label: "Detect (Boxes 2D)",
        python: "Detect",
        defaultTopic: "rt/model/boxes2d",
        fields: [
          { label: "boxes", python: "boxes" }
        ]
      },
      {
        label: "Mask",
        python: "Mask",
        defaultTopic: "rt/model/mask",
        fields: [
          { label: "data", python: "data" },
          { label: "width", python: "width" },
          { label: "height", python: "height" }
        ]
      },
      {
        label: "Model Info",
        python: "ModelInfo",
        defaultTopic: "rt/model/info",
        fields: [
          { label: "name", python: "name" },
          { label: "framework", python: "framework" },
          { label: "input width", python: "input_width" },
          { label: "input height", python: "input_height" }
        ]
      },
      {
        label: "Box 2D",
        python: "Box2D",
        defaultTopic: null,
        fields: [
          { label: "label", python: "label" },
          { label: "confidence", python: "confidence" },
          { label: "center x", python: "center_x" },
          { label: "center y", python: "center_y" },
          { label: "width", python: "size_x" },
          { label: "height", python: "size_y" }
        ]
      }
    ]
  },
  {
    label: "Sensors",
    module: "edgefirst.schemas.sensor_msgs",
    types: [
      {
        label: "IMU",
        python: "Imu",
        defaultTopic: "rt/imu",
        fields: [
          { label: "accel x", python: "linear_acceleration_x" },
          { label: "accel y", python: "linear_acceleration_y" },
          { label: "accel z", python: "linear_acceleration_z" },
          { label: "gyro x", python: "angular_velocity_x" },
          { label: "gyro y", python: "angular_velocity_y" },
          { label: "gyro z", python: "angular_velocity_z" }
        ]
      },
      {
        label: "GPS",
        python: "NavSatFix",
        defaultTopic: "rt/gps",
        fields: [
          { label: "latitude", python: "latitude" },
          { label: "longitude", python: "longitude" },
          { label: "altitude", python: "altitude" }
        ]
      },
      {
        label: "Temperature",
        python: "Temperature",
        defaultTopic: "rt/temperature",
        fields: [
          { label: "temperature", python: "temperature" },
          { label: "variance", python: "variance" }
        ]
      },
      {
        label: "Illuminance",
        python: "Illuminance",
        defaultTopic: "rt/illuminance",
        fields: [
          { label: "illuminance", python: "illuminance" },
          { label: "variance", python: "variance" }
        ]
      },
      {
        label: "Humidity",
        python: "RelativeHumidity",
        defaultTopic: "rt/humidity",
        fields: [
          { label: "relative humidity", python: "relative_humidity" },
          { label: "variance", python: "variance" }
        ]
      },
      {
        label: "Pressure",
        python: "FluidPressure",
        defaultTopic: "rt/pressure",
        fields: [
          { label: "fluid pressure", python: "fluid_pressure" },
          { label: "variance", python: "variance" }
        ]
      }
    ]
  }
];
function ee(t) {
  for (const e of u) {
    const o = e.types.find((s) => s.python === t);
    if (o) return o;
  }
}
function te(t) {
  for (const e of u)
    if (e.types.some((o) => o.python === t))
      return e.module;
}
function oe() {
  const t = [];
  for (const e of u)
    for (const o of e.types) {
      if (o.fields.length === 0) continue;
      const s = `edgefirst_field_${o.python.toLowerCase()}`, d = o.fields.map((c) => [c.label, c.python]);
      t.push({
        type: s,
        message0: "%1 of %2",
        args0: [
          {
            type: "field_dropdown",
            name: "FIELD",
            options: d
          },
          {
            type: "field_variable",
            name: "VAR",
            variable: "msg"
          }
        ],
        output: null,
        style: "data_blocks",
        tooltip: `Get a field from a ${o.label} message`,
        helpUrl: ""
      });
    }
  return t;
}
function ne(t) {
  const e = u.find((o) => o.module === t);
  return e ? e.types.filter((o) => o.defaultTopic).map((o) => [o.label, o.python]) : [["(none)", ""]];
}
const se = {
  type: "edgefirst_on_message",
  message0: "on %1 %2 message from %3",
  args0: [
    {
      type: "field_dropdown",
      name: "GROUP",
      options: u.map((t) => [t.label, t.module])
    },
    {
      type: "field_dropdown",
      name: "TYPE",
      options: ne(u[0].module)
    },
    {
      type: "field_input",
      name: "TOPIC",
      text: u[0].types[0].defaultTopic ?? "rt/topic"
    }
  ],
  message1: "as %1 do %2",
  args1: [
    {
      type: "field_variable",
      name: "MSG_VAR",
      variable: "msg"
    },
    {
      type: "input_statement",
      name: "HANDLER"
    }
  ],
  style: "hat_blocks",
  tooltip: "Entry point — runs your code each time a typed message arrives on the topic.",
  helpUrl: "",
  extensions: ["edgefirst_message_type_extension"]
};
let A = !1;
function ie() {
  if (A) return;
  A = !0, m.Extensions.isRegistered("edgefirst_message_type_extension") || m.Extensions.register(
    "edgefirst_message_type_extension",
    function() {
      const o = this.getField("GROUP"), s = this.getField("TYPE"), d = this.getField("TOPIC");
      o.setValidator(function(c) {
        const p = u.find((_) => _.module === c);
        if (p) {
          const _ = p.types.filter((f) => f.defaultTopic).map((f) => [f.label, f.python]);
          s.menuGenerator_ = _, s.setValue(_[0][1]);
        }
        return c;
      }), s.setValidator(function(c) {
        const p = ee(c);
        return p?.defaultTopic && d.setValue(p.defaultTopic), c;
      });
    }
  );
  const t = oe(), e = [se, ...t];
  m.common.defineBlocksWithJsonArray(e);
}
const le = [
  {
    type: "edgefirst_model_load",
    message0: "load model %1 as %2",
    args0: [
      { type: "field_input", name: "PATH", text: "model.tflite" },
      { type: "field_variable", name: "VAR", variable: "model" }
    ],
    previousStatement: null,
    nextStatement: null,
    style: "model_blocks",
    tooltip: "Load a TFLite model at startup. Runs once when the program starts, not on every message.",
    helpUrl: ""
  },
  {
    type: "edgefirst_model_run",
    message0: "run %1 on %2",
    args0: [
      { type: "field_variable", name: "MODEL", variable: "model" },
      { type: "input_value", name: "INPUT", check: ["DMABuffer", "Image"] }
    ],
    previousStatement: null,
    nextStatement: null,
    style: "model_blocks",
    tooltip: "Run inference on an image. Results are read by Boxes or Mask blocks using the same model variable.",
    helpUrl: ""
  },
  {
    type: "edgefirst_model_boxes",
    message0: "boxes from %1",
    args0: [
      { type: "field_variable", name: "MODEL", variable: "model" }
    ],
    output: "Detections",
    style: "model_blocks",
    tooltip: "Decode bounding boxes from the last inference run on this model",
    helpUrl: ""
  },
  {
    type: "edgefirst_model_mask",
    message0: "mask from %1",
    args0: [
      { type: "field_variable", name: "MODEL", variable: "model" }
    ],
    output: "MaskData",
    style: "model_blocks",
    tooltip: "Decode segmentation mask from the last inference run on this model",
    helpUrl: ""
  }
];
let $ = !1;
function re() {
  $ || ($ = !0, m.common.defineBlocksWithJsonArray(le));
}
const ae = [
  {
    type: "edgefirst_processing_resize",
    message0: "resize %1 to %2 x %3",
    args0: [
      { type: "input_value", name: "INPUT", check: ["DMABuffer", "Image"] },
      { type: "field_number", name: "WIDTH", value: 320, min: 1, max: 4096 },
      { type: "field_number", name: "HEIGHT", value: 320, min: 1, max: 4096 }
    ],
    output: "Image",
    style: "processing_blocks",
    tooltip: "Resize an image to the specified dimensions",
    helpUrl: ""
  },
  {
    type: "edgefirst_processing_convert",
    message0: "convert %1 to %2",
    args0: [
      { type: "input_value", name: "INPUT", check: ["DMABuffer", "Image"] },
      { type: "field_dropdown", name: "FORMAT", options: [["RGB", "RGB"], ["BGR", "BGR"], ["Grayscale", "GRAY"]] }
    ],
    output: "Image",
    style: "processing_blocks",
    tooltip: "Convert image color format",
    helpUrl: ""
  },
  {
    type: "edgefirst_processing_crop",
    message0: "crop %1 to %2",
    args0: [
      { type: "input_value", name: "IMAGE", check: "Image" },
      { type: "input_value", name: "BOX", check: "Box" }
    ],
    output: "Image",
    style: "processing_blocks",
    tooltip: "Crop an image to a bounding box region",
    helpUrl: ""
  },
  {
    type: "edgefirst_processing_track",
    message0: "track %1",
    args0: [{ type: "input_value", name: "DETECTIONS", check: "Detections" }],
    output: "Detections",
    style: "processing_blocks",
    tooltip: "Track detections across frames using ByteTrack. Tracker state persists between messages.",
    helpUrl: ""
  },
  {
    type: "edgefirst_processing_nms",
    message0: "NMS %1 threshold %2",
    args0: [
      { type: "input_value", name: "DETECTIONS", check: "Detections" },
      { type: "field_number", name: "THRESHOLD", value: 0.5, min: 0, max: 1, precision: 0.05 }
    ],
    output: "Detections",
    style: "processing_blocks",
    tooltip: "Apply non-maximum suppression to filter overlapping detections",
    helpUrl: ""
  }
];
let L = !1;
function ce() {
  L || (L = !0, m.common.defineBlocksWithJsonArray(ae));
}
const pe = [
  {
    type: "edgefirst_data_serialize",
    message0: "serialize %1",
    args0: [{ type: "input_value", name: "DATA" }],
    output: "Bytes",
    style: "data_blocks",
    tooltip: "Serialize data to CDR bytes for publishing",
    helpUrl: ""
  },
  {
    type: "edgefirst_data_image_array",
    message0: "numpy array from %1",
    args0: [{ type: "input_value", name: "INPUT", check: ["DMABuffer", "Image"] }],
    output: "Image",
    style: "data_blocks",
    tooltip: "Convert image data to a numpy array",
    helpUrl: ""
  }
];
let M = !1;
function de() {
  M || (M = !0, m.common.defineBlocksWithJsonArray(pe));
}
const me = [
  {
    type: "edgefirst_flow_for_each_box",
    message0: "for each box in %1",
    args0: [{ type: "input_value", name: "DETECTIONS", check: "Detections" }],
    message1: "do %1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    style: "flow_blocks",
    tooltip: "Loop over each detection box",
    helpUrl: ""
  },
  {
    type: "edgefirst_flow_if_label",
    message0: "if label is %1",
    args0: [{ type: "field_input", name: "LABEL", text: "person" }],
    message1: "do %1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    style: "flow_blocks",
    tooltip: "Use inside a 'for each box' block to filter by detection label.",
    helpUrl: ""
  },
  {
    type: "edgefirst_flow_if_confidence",
    message0: "if confidence > %1",
    args0: [{ type: "field_number", name: "THRESHOLD", value: 0.5, min: 0, max: 1, precision: 0.05 }],
    message1: "do %1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    style: "flow_blocks",
    tooltip: "Use inside a 'for each box' block to filter by confidence threshold.",
    helpUrl: ""
  },
  {
    type: "edgefirst_flow_log",
    message0: "log %1",
    args0: [{ type: "field_input", name: "MESSAGE", text: "message" }],
    previousStatement: null,
    nextStatement: null,
    style: "flow_blocks",
    tooltip: "Log a fixed text message. Visible in the program logs panel.",
    helpUrl: ""
  }
];
let P = !1;
function ue() {
  P || (P = !0, m.common.defineBlocksWithJsonArray(me));
}
function l(t, e, o) {
  t.definitions_[e] = o;
}
function fe(t) {
  return t.edgefirst_;
}
function B(t) {
  return t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
i.forBlock.edgefirst_zenoh_publish = function(t, e) {
  const o = e.valueToCode(t, "DATA", a.NONE) || "''", s = t.getFieldValue("TOPIC");
  l(e, "import_zenoh", "import zenoh");
  const c = t.getInputTargetBlock("DATA")?.outputConnection?.getCheck()?.[0];
  let p;
  switch (c) {
    case "Bytes":
      p = o;
      break;
    case "Detections":
    case "MaskData":
      p = `${o}.serialize()`;
      break;
    case "String":
      p = `str(${o}).encode()`;
      break;
    default:
      p = `str(${o}).encode()`;
      break;
  }
  return `session.put("${B(s)}", ${p})
`;
};
i.forBlock.edgefirst_zenoh_topic = function(t) {
  return [`"${t.getFieldValue("TOPIC")}"`, a.ATOMIC];
};
i.forBlock.edgefirst_on_message = function(t, e) {
  const o = t.getFieldValue("GROUP"), s = t.getFieldValue("TYPE"), d = t.getFieldValue("TOPIC"), c = t.getFieldValue("MSG_VAR"), p = e.getVariableName(c), _ = e.statementToCode(t, "HANDLER");
  l(e, "import_zenoh", "import zenoh"), l(e, "import_signal", "import signal"), l(e, "import_time", "import time");
  const f = o || te(s) || "edgefirst.schemas.edgefirst_msgs";
  l(
    e,
    `import_schema_${s}`,
    `from ${f} import ${s}`
  );
  const b = fe(e), k = b.handlerCounter++;
  return b.handlers.push({
    topic: d,
    index: k,
    body: _,
    msgType: s,
    msgVar: p,
    importPath: f
  }), "";
};
function ge(t) {
  i.forBlock[t] = function(e, o) {
    const s = e.getFieldValue("FIELD");
    return [`${o.getVariableName(e.getFieldValue("VAR") || "msg")}.${s}`, a.MEMBER];
  };
}
for (const t of u)
  for (const e of t.types) {
    if (e.fields.length === 0) continue;
    const o = `edgefirst_field_${e.python.toLowerCase()}`;
    ge(o);
  }
i.forBlock.edgefirst_model_load = function(t, e) {
  const o = t.getFieldValue("PATH"), s = e.getVariableName(
    t.getFieldValue("VAR") || "model"
  );
  return l(
    e,
    "import_tflite",
    "from edgefirst.tflite import Interpreter"
  ), l(
    e,
    `setup_1_${s}`,
    `${s} = Interpreter('${o}')`
  ), "";
};
i.forBlock.edgefirst_model_run = function(t, e) {
  const o = e.getVariableName(
    t.getFieldValue("MODEL") || "model"
  ), s = e.valueToCode(t, "INPUT", a.NONE) || "image";
  return `${o}.set_input(${s})
${o}.invoke()
`;
};
i.forBlock.edgefirst_model_boxes = function(t, e) {
  const o = e.getVariableName(
    t.getFieldValue("MODEL") || "model"
  );
  return l(
    e,
    "import_hal_decoder",
    "from edgefirst.hal import Decoder"
  ), l(
    e,
    "setup_2_decoder",
    "decoder = Decoder(model, threshold=0.5)"
  ), [`decoder.decode(${o})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_model_mask = function(t, e) {
  const o = e.getVariableName(
    t.getFieldValue("MODEL") || "model"
  );
  return l(
    e,
    "import_hal_decoder",
    "from edgefirst.hal import Decoder"
  ), l(
    e,
    "setup_2_mask_decoder",
    "mask_decoder = Decoder(model)"
  ), [`mask_decoder.decode(${o})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_processing_resize = function(t, e) {
  const o = e.valueToCode(t, "INPUT", a.NONE) || "image", s = t.getFieldValue("WIDTH"), d = t.getFieldValue("HEIGHT");
  return l(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), l(e, "setup_processor", "processor = ImageProcessor()"), [`processor.resize(${o}, ${s}, ${d})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_processing_convert = function(t, e) {
  const o = e.valueToCode(t, "INPUT", a.NONE) || "image", s = t.getFieldValue("FORMAT");
  return l(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), l(e, "setup_processor", "processor = ImageProcessor()"), [`processor.convert(${o}, '${s}')`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_processing_crop = function(t, e) {
  const o = e.valueToCode(t, "IMAGE", a.NONE) || "image", s = e.valueToCode(t, "BOX", a.NONE) || "box";
  return l(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), l(e, "setup_processor", "processor = ImageProcessor()"), [`processor.crop(${o}, ${s})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_processing_track = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", a.NONE) || "detections";
  return l(e, "import_hal_tracker", "from edgefirst.hal import Tracker"), l(e, "setup_tracker", "tracker = Tracker()"), [`tracker.update(${o})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_processing_nms = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", a.NONE) || "detections", s = t.getFieldValue("THRESHOLD");
  return [`${o}.nms(${s})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_data_serialize = function(t, e) {
  return [`${e.valueToCode(t, "DATA", a.NONE) || "data"}.serialize()`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_data_image_array = function(t, e) {
  const o = e.valueToCode(t, "INPUT", a.NONE) || "image";
  return l(e, "import_numpy", "import numpy as np"), [`np.asarray(${o})`, a.FUNCTION_CALL];
};
i.forBlock.edgefirst_flow_for_each_box = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", a.NONE) || "detections", s = e.statementToCode(t, "BODY") || `    pass
`;
  return `for box in ${o}.boxes:
${s}`;
};
i.forBlock.edgefirst_flow_if_label = function(t, e) {
  const o = t.getFieldValue("LABEL"), s = e.statementToCode(t, "BODY") || `    pass
`;
  return `if box.label == "${B(o)}":
${s}`;
};
i.forBlock.edgefirst_flow_if_confidence = function(t, e) {
  const o = t.getFieldValue("THRESHOLD"), s = e.statementToCode(t, "BODY") || `    pass
`;
  return `if box.confidence > ${o}:
${s}`;
};
i.forBlock.edgefirst_flow_log = function(t, e) {
  const o = t.getFieldValue("MESSAGE");
  return l(e, "import_logging", "import logging"), l(e, "module_logger", "logger = logging.getLogger(__name__)"), `logger.info("${B(o)}")
`;
};
function _e() {
  Q(), ie(), re(), ce(), de(), ue();
}
function ye(t) {
  return t.replace(/^rt\//, "").replace(/\//g, "_").replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || "topic";
}
function he() {
  if (i.__edgefirstRegistered) return;
  i.__edgefirstRegistered = !0;
  const t = i.init.bind(i), e = i.finish.bind(i);
  i.INDENT = "    ", i.init = function(o) {
    t(o), this.edgefirst_ = {
      handlers: [],
      handlerCounter: 0
    };
  }, i.finish = function(o) {
    const s = this.edgefirst_;
    if (!s || s.handlers.length === 0)
      return e(o);
    l(this, "import_logging", "import logging"), l(this, "import_signal", "import signal"), l(this, "import_time", "import time"), l(this, "import_zenoh", "import zenoh");
    const d = this.definitions_, c = [];
    for (const [n, r] of Object.entries(d))
      n.startsWith("setup_") && c.push([n, r]);
    c.sort((n, r) => n[0].localeCompare(r[0]));
    const p = c.map(([, n]) => n);
    for (const n of Object.keys(d))
      n.startsWith("setup_") && delete d[n];
    delete d.module_logger;
    const _ = /* @__PURE__ */ new Set(["logging", "signal", "time", "sys", "os", "json"]), f = /* @__PURE__ */ new Set(["zenoh", "numpy", "cv2"]), b = [];
    for (const [n, r] of Object.entries(d))
      (n.startsWith("import_") || n.startsWith("module_")) && b.push(r);
    const k = [], T = [], C = [];
    for (const n of b) {
      const r = n.match(/^(?:import|from)\s+(\w+)/)?.[1] ?? "";
      _.has(r) ? k.push(n) : f.has(r) ? T.push(n) : C.push(n);
    }
    k.sort(), T.sort(), C.sort();
    const I = [k, T, C].filter((n) => n.length > 0).map((n) => n.join(`
`)).join(`

`), N = e(o).split(`
`).filter((n) => {
      const r = n.trim();
      return !(!r || r.startsWith("import ") || r.startsWith("from ") || /^\w+\s*=\s*None$/.test(r));
    }).join(`
`).trim(), w = [...s.handlers].sort(
      (n, r) => n.topic.localeCompare(r.topic)
    ), O = /* @__PURE__ */ new Map(), x = w.map((n) => {
      let r = ye(n.topic);
      const g = O.get(r) ?? 0;
      return O.set(r, g + 1), g > 0 && (r = `${r}_${g}`), { ...n, slug: r };
    }), z = `#!/usr/bin/env python3
"""Generated by EdgeFirst Blockly v0.1.0"""`, U = `logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)`;
    let v = "";
    p.length > 0 && (v = `# --- Setup ---

${p.join(`
`)}`);
    const V = `# --- Signal handling ---

running = True


def on_exit(sig, frame):
    global running
    running = False


signal.signal(signal.SIGTERM, on_exit)
signal.signal(signal.SIGINT, on_exit)`, R = `# --- Handlers ---

${x.map((n) => {
      const r = n.body || "", g = n.msgType || "", H = n.msgVar || "msg", F = r.split(`
`), E = F.filter((h) => h.trim().length > 0), j = E.length > 0 ? Math.min(...E.map((h) => h.match(/^(\s*)/)?.[1].length ?? 0)) : 0, W = "    ", D = F.map((h) => {
        if (!h.trim()) return "";
        const X = h.slice(j);
        return W + X;
      }).join(`
`), Y = g ? `
    ${H} = ${g}.deserialize(sample.payload.to_bytes())` : "", J = D.trim() ? `
` + D : `
    pass`, K = g ? "sample" : "msg", Z = g ? ` ${g}` : "";
      return `def on_${n.slug}(${K}):
    """Handle${Z} messages from ${n.topic}."""${Y}${J}`;
    }).map((n) => n.replace(/\n+$/, "")).join(`


`)}`, G = `# --- Main ---

session = zenoh.open(zenoh.Config())

${x.map(
      (n) => `session.declare_subscriber("${n.topic}", on_${n.slug})
logger.info("Listening on ${n.topic}")`
    ).join(`

`)}

while running:
    time.sleep(0.1)

session.close()`, y = [z];
    return I && y.push(I), N && y.push(N), y.push(U), v && y.push(v), y.push(V), y.push(R), y.push(G), y.join(`

`) + `
`;
  };
}
function be() {
  const t = [];
  t.push({
    kind: "block",
    type: "edgefirst_on_message"
  }), t.push({ kind: "sep", gap: "24" });
  for (const e of u)
    for (const o of e.types)
      o.fields.length !== 0 && t.push({
        kind: "block",
        type: `edgefirst_field_${o.python.toLowerCase()}`
      });
  return t;
}
const Be = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Messages",
      categoryStyle: "messages_category",
      contents: be()
    },
    {
      kind: "category",
      name: "Zenoh",
      categoryStyle: "zenoh_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_zenoh_publish"
        },
        {
          kind: "block",
          type: "edgefirst_zenoh_topic"
        }
      ]
    },
    {
      kind: "category",
      name: "Model",
      categoryStyle: "model_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_model_load",
          fields: { PATH: "model.tflite" }
        },
        {
          kind: "block",
          type: "edgefirst_model_run"
        },
        {
          kind: "block",
          type: "edgefirst_model_boxes"
        },
        {
          kind: "block",
          type: "edgefirst_model_mask"
        }
      ]
    },
    {
      kind: "category",
      name: "Processing",
      categoryStyle: "processing_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_processing_resize"
        },
        {
          kind: "block",
          type: "edgefirst_processing_convert"
        },
        {
          kind: "block",
          type: "edgefirst_processing_crop"
        },
        {
          kind: "block",
          type: "edgefirst_processing_track"
        },
        {
          kind: "block",
          type: "edgefirst_processing_nms"
        }
      ]
    },
    {
      kind: "category",
      name: "Data",
      categoryStyle: "data_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_data_serialize"
        },
        {
          kind: "block",
          type: "edgefirst_data_image_array"
        }
      ]
    },
    {
      kind: "category",
      name: "Flow",
      categoryStyle: "flow_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_flow_for_each_box"
        },
        {
          kind: "block",
          type: "edgefirst_flow_if_label"
        },
        {
          kind: "block",
          type: "edgefirst_flow_if_confidence"
        },
        {
          kind: "block",
          type: "edgefirst_flow_log"
        }
      ]
    },
    {
      kind: "sep"
    },
    // Built-in Procedures/Functions category is excluded — it generates synchronous
    // `def` functions which cannot use `await` inside async handlers.
    {
      kind: "category",
      name: "Variables",
      custom: "VARIABLE"
    },
    {
      kind: "category",
      name: "Logic",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_boolean" }
      ]
    },
    {
      kind: "category",
      name: "Math",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "math_number_property" }
      ]
    },
    {
      kind: "category",
      name: "Loops",
      contents: [
        { kind: "block", type: "controls_repeat_ext" },
        { kind: "block", type: "controls_whileUntil" },
        { kind: "block", type: "controls_for" }
      ]
    },
    {
      kind: "category",
      name: "Lists",
      contents: [
        { kind: "block", type: "lists_create_with" },
        { kind: "block", type: "lists_length" },
        { kind: "block", type: "lists_getIndex" }
      ]
    },
    {
      kind: "category",
      name: "Text",
      contents: [
        { kind: "block", type: "text" },
        { kind: "block", type: "text_join" }
      ]
    }
  ]
}, Ie = m.Theme.defineTheme("edgefirst", {
  name: "edgefirst",
  base: m.Themes.Classic,
  blockStyles: {
    hat_blocks: { colourPrimary: "#2962FF", hat: "cap" },
    zenoh_blocks: { colourPrimary: "#2962FF" },
    messages_blocks: { colourPrimary: "#2962FF" },
    model_blocks: { colourPrimary: "#7B1FA2" },
    processing_blocks: { colourPrimary: "#E65100" },
    data_blocks: { colourPrimary: "#00838F" },
    flow_blocks: { colourPrimary: "#F9A825" }
  },
  categoryStyles: {
    zenoh_category: { colour: "#2962FF" },
    messages_category: { colour: "#2962FF" },
    model_category: { colour: "#7B1FA2" },
    processing_category: { colour: "#E65100" },
    data_category: { colour: "#00838F" },
    flow_category: { colour: "#F9A825" }
  },
  componentStyles: {
    workspaceBackgroundColour: "#1e1e1e",
    toolboxBackgroundColour: "#252526",
    toolboxForegroundColour: "#cccccc",
    flyoutBackgroundColour: "#2d2d30",
    flyoutForegroundColour: "#cccccc",
    flyoutOpacity: 0.9,
    scrollbarColour: "#797979",
    scrollbarOpacity: 0.4
  }
}), Ne = {
  /** Raw DMA buffer from the camera hardware, produced by the Camera Frame block. */
  DMABuffer: "DMABuffer",
  /** Processed image (numpy array), produced by resize/convert/crop blocks. */
  Image: "Image",
  /** Detection list (bounding boxes), produced by model_boxes and track/NMS blocks. */
  Detections: "Detections",
  /** Single detection box, produced by the for-each-box loop variable. */
  Box: "Box",
  /** Segmentation mask data, produced by the model_mask block. */
  MaskData: "MaskData",
  /** Raw model inference output tensor(s), produced by the model_run block. */
  ModelOutput: "ModelOutput",
  /** 3-D point cloud (reserved for future LiDAR blocks). */
  PointCloud: "PointCloud",
  /** Raw byte buffer, used for serialized CDR messages. */
  Bytes: "Bytes"
};
function Oe() {
  _e(), he();
}
export {
  Ne as CONNECTION_TYPES,
  u as SCHEMA_REGISTRY,
  l as addDefinition,
  Ie as edgefirstTheme,
  Be as edgefirstToolbox,
  B as escapePython,
  fe as getEdgeFirstState,
  Oe as register,
  _e as registerEdgeFirstBlocks,
  he as registerEdgeFirstGenerators,
  ye as slugifyTopic
};
//# sourceMappingURL=edgefirst-blockly.es.js.map
