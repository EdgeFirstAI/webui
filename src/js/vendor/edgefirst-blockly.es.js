import * as u from "blockly/core";
import { pythonGenerator as r, Order as i } from "blockly/python";
const M = [
  {
    type: "edgefirst_zenoh_on_message",
    message0: "on message from %1",
    args0: [
      {
        type: "field_dropdown",
        name: "TOPIC",
        options: [
          ["Camera DMA", "rt/camera/dma"],
          ["Camera JPEG", "rt/camera/jpeg"],
          ["Camera Info", "rt/camera/info"],
          ["Model Boxes", "rt/model/boxes2d"],
          ["Model Mask", "rt/model/mask"],
          ["Model Info", "rt/model/info"],
          ["GPS", "rt/gps"],
          ["IMU", "rt/imu"]
        ]
      }
    ],
    message1: "do %1",
    args1: [
      {
        type: "input_statement",
        name: "HANDLER"
      }
    ],
    style: "hat_blocks",
    tooltip: "Entry point — runs your code each time a message arrives. Use multiple blocks for different topics.",
    helpUrl: ""
  },
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
let C = !1;
function P() {
  C || (C = !0, u.common.defineBlocksWithJsonArray(M));
}
const z = [
  {
    type: "edgefirst_camera_frame",
    message0: "frame",
    output: "DMABuffer",
    style: "camera_blocks",
    tooltip: "Deserialize a DMA buffer from the incoming message",
    helpUrl: ""
  },
  {
    type: "edgefirst_camera_info",
    message0: "camera info %1",
    args0: [
      {
        type: "field_dropdown",
        name: "FIELD",
        options: [
          ["width", "width"],
          ["height", "height"],
          ["format", "fourcc"]
        ]
      }
    ],
    output: "String",
    style: "camera_blocks",
    tooltip: "Get camera info field from the message",
    helpUrl: ""
  }
];
let B = !1;
function R() {
  B || (B = !0, u.common.defineBlocksWithJsonArray(z));
}
const V = [
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
    output: "ModelOutput",
    style: "model_blocks",
    tooltip: "Run inference on an image using a loaded model",
    helpUrl: ""
  },
  {
    type: "edgefirst_model_boxes",
    message0: "boxes from %1",
    args0: [
      { type: "input_value", name: "OUTPUT", check: "ModelOutput" }
    ],
    output: "Detections",
    style: "model_blocks",
    tooltip: "Decode bounding boxes from model output",
    helpUrl: ""
  },
  {
    type: "edgefirst_model_mask",
    message0: "mask from %1",
    args0: [
      { type: "input_value", name: "OUTPUT", check: "ModelOutput" }
    ],
    output: "MaskData",
    style: "model_blocks",
    tooltip: "Decode segmentation mask from model output",
    helpUrl: ""
  }
];
let N = !1;
function G() {
  N || (N = !0, u.common.defineBlocksWithJsonArray(V));
}
const H = [
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
let I = !1;
function j() {
  I || (I = !0, u.common.defineBlocksWithJsonArray(H));
}
const q = [
  {
    type: "edgefirst_data_deserialize",
    message0: "deserialize %1 as %2",
    args0: [
      { type: "input_value", name: "DATA", check: "Bytes" },
      { type: "field_dropdown", name: "TYPE", options: [
        ["DMA Buffer", "DmaBuffer"],
        ["Boxes 2D", "Detect"],
        ["Camera Info", "CameraInfo"],
        ["IMU", "Imu"],
        ["GPS", "NavSatFix"]
      ] }
    ],
    // output: null — dynamic type depends on TYPE dropdown selection.
    // Future: use block extension to update output type when dropdown changes.
    output: null,
    style: "data_blocks",
    tooltip: "Deserialize raw bytes into a typed message",
    helpUrl: ""
  },
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
    type: "edgefirst_data_box_field",
    message0: "%1 of %2",
    args0: [
      { type: "field_dropdown", name: "FIELD", options: [
        ["label", "label"],
        ["confidence", "confidence"],
        ["center x", "center_x"],
        ["center y", "center_y"],
        ["width", "size_x"],
        ["height", "size_y"]
      ] },
      { type: "input_value", name: "BOX", check: "Box" }
    ],
    // output: null — dynamic type depends on TYPE dropdown selection.
    // Future: use block extension to update output type when dropdown changes.
    output: null,
    style: "data_blocks",
    tooltip: "Get a field from a detection box",
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
let O = !1;
function W() {
  O || (O = !0, u.common.defineBlocksWithJsonArray(q));
}
const Y = [
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
let E = !1;
function J() {
  E || (E = !0, u.common.defineBlocksWithJsonArray(Y));
}
function a(t, e, o) {
  t.definitions_[e] = o;
}
function Z(t) {
  return t.edgefirst_;
}
function y(t) {
  return t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
r.forBlock.edgefirst_zenoh_on_message = function(t, e) {
  const o = t.getFieldValue("TOPIC"), n = e.statementToCode(t, "HANDLER");
  a(e, "import_asyncio", "import asyncio"), a(e, "import_zenoh", "import zenoh");
  const c = e.provideFunction_(
    "MessageDrain",
    `
class ${e.FUNCTION_NAME_PLACEHOLDER_}:
    """Thread-safe bridge from Zenoh subscriber callbacks to asyncio.

    Zenoh callbacks run on the subscriber thread. asyncio.Queue is not
    thread-safe, so all queue operations must happen on the event loop
    thread via call_soon_threadsafe.
    """
    def __init__(self, loop, maxsize=2):
        self._queue = asyncio.Queue(maxsize=maxsize)
        self._loop = loop

    def callback(self, msg):
        """Called from Zenoh subscriber thread — must not touch the queue directly."""
        if not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self._enqueue, msg)

    def _enqueue(self, msg):
        """Runs on the event loop thread — safe to manipulate the queue."""
        if self._queue.full():
            self._queue.get_nowait()
        self._queue.put_nowait(msg)

    async def get_latest(self):
        """Wait for a message, then drain to the newest available."""
        latest = await self._queue.get()
        while not self._queue.empty():
            latest = self._queue.get_nowait()
        return latest
`
  ), m = Z(e), p = m.handlerCounter++;
  return m.handlers.push({ topic: o, index: p, drainClass: c, body: n }), "";
};
r.forBlock.edgefirst_zenoh_publish = function(t, e) {
  const o = e.valueToCode(t, "DATA", i.NONE) || "''", n = t.getFieldValue("TOPIC");
  a(e, "import_zenoh", "import zenoh");
  const m = t.getInputTargetBlock("DATA")?.outputConnection?.getCheck()?.[0];
  let p;
  switch (m) {
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
  return `session.put("${y(n)}", ${p})
`;
};
r.forBlock.edgefirst_zenoh_topic = function(t) {
  return [`"${t.getFieldValue("TOPIC")}"`, i.ATOMIC];
};
r.forBlock.edgefirst_camera_frame = function(t, e) {
  return a(
    e,
    "import_dmabuffer",
    "from edgefirst.schemas.edgefirst_msgs import DmaBuffer"
  ), ["DmaBuffer.deserialize(msg.payload.to_bytes())", i.FUNCTION_CALL];
};
r.forBlock.edgefirst_camera_info = function(t, e) {
  const o = t.getFieldValue("FIELD");
  return a(
    e,
    "import_camera_info",
    "from edgefirst.schemas.edgefirst_msgs import CameraInfo"
  ), [`CameraInfo.deserialize(msg.payload.to_bytes()).${o}`, i.MEMBER];
};
r.forBlock.edgefirst_model_load = function(t, e) {
  const o = t.getFieldValue("PATH"), n = e.getVariableName(
    t.getFieldValue("VAR") || "model"
  );
  return a(
    e,
    "import_tflite",
    "from edgefirst.tflite import Interpreter"
  ), a(
    e,
    `setup_${n}`,
    `    ${n} = Interpreter('${o}')`
  ), "";
};
r.forBlock.edgefirst_model_run = function(t, e) {
  const o = e.getVariableName(
    t.getFieldValue("MODEL") || "model"
  ), n = e.valueToCode(t, "INPUT", i.NONE) || "image";
  return a(e, "import_asyncio", "import asyncio"), [`await ${e.provideFunction_(
    "run_model",
    `
async def ${e.FUNCTION_NAME_PLACEHOLDER_}(model, input_data):
    loop = asyncio.get_running_loop()
    def _invoke():
        model.set_input(input_data)
        model.invoke()
    await loop.run_in_executor(None, _invoke)
    return model
`
  )}(${o}, ${n})`, i.NONE];
};
r.forBlock.edgefirst_model_boxes = function(t, e) {
  const o = e.valueToCode(t, "OUTPUT", i.NONE) || "model";
  return a(
    e,
    "import_hal_decoder",
    "from edgefirst.hal import Decoder"
  ), a(
    e,
    "setup_decoder",
    "    decoder = Decoder(model, threshold=0.5)"
  ), [`decoder.decode(${o})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_model_mask = function(t, e) {
  const o = e.valueToCode(t, "OUTPUT", i.NONE) || "model";
  return a(
    e,
    "import_hal_decoder",
    "from edgefirst.hal import Decoder"
  ), a(
    e,
    "setup_mask_decoder",
    "    mask_decoder = Decoder(model)"
  ), [`mask_decoder.decode(${o})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_processing_resize = function(t, e) {
  const o = e.valueToCode(t, "INPUT", i.NONE) || "image", n = t.getFieldValue("WIDTH"), c = t.getFieldValue("HEIGHT");
  return a(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), a(e, "setup_processor", "    processor = ImageProcessor()"), [`processor.resize(${o}, ${n}, ${c})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_processing_convert = function(t, e) {
  const o = e.valueToCode(t, "INPUT", i.NONE) || "image", n = t.getFieldValue("FORMAT");
  return a(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), a(e, "setup_processor", "    processor = ImageProcessor()"), [`processor.convert(${o}, '${n}')`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_processing_crop = function(t, e) {
  const o = e.valueToCode(t, "IMAGE", i.NONE) || "image", n = e.valueToCode(t, "BOX", i.NONE) || "box";
  return a(e, "import_hal_processor", "from edgefirst.hal import ImageProcessor"), a(e, "setup_processor", "    processor = ImageProcessor()"), [`processor.crop(${o}, ${n})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_processing_track = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", i.NONE) || "detections";
  return a(e, "import_hal_tracker", "from edgefirst.hal import Tracker"), a(e, "setup_tracker", "    tracker = Tracker()"), [`tracker.update(${o})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_processing_nms = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", i.NONE) || "detections", n = t.getFieldValue("THRESHOLD");
  return [`${o}.nms(${n})`, i.FUNCTION_CALL];
};
const K = {
  DmaBuffer: "from edgefirst.schemas.edgefirst_msgs import DmaBuffer",
  Detect: "from edgefirst.schemas.edgefirst_msgs import Detect",
  CameraInfo: "from edgefirst.schemas.edgefirst_msgs import CameraInfo",
  Imu: "from edgefirst.schemas.edgefirst_msgs import Imu",
  NavSatFix: "from edgefirst.schemas.edgefirst_msgs import NavSatFix"
};
r.forBlock.edgefirst_data_deserialize = function(t, e) {
  const o = e.valueToCode(t, "DATA", i.NONE) || "msg.payload.to_bytes()", n = t.getFieldValue("TYPE"), c = K[n];
  return c && a(e, `import_schema_${n}`, c), [`${n}.deserialize(${o})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_data_serialize = function(t, e) {
  return [`${e.valueToCode(t, "DATA", i.NONE) || "data"}.serialize()`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_data_box_field = function(t, e) {
  const o = t.getFieldValue("FIELD");
  return [`${e.valueToCode(t, "BOX", i.NONE) || "box"}.${o}`, i.MEMBER];
};
r.forBlock.edgefirst_data_image_array = function(t, e) {
  const o = e.valueToCode(t, "INPUT", i.NONE) || "image";
  return a(e, "import_numpy", "import numpy as np"), [`np.asarray(${o})`, i.FUNCTION_CALL];
};
r.forBlock.edgefirst_flow_for_each_box = function(t, e) {
  const o = e.valueToCode(t, "DETECTIONS", i.NONE) || "detections", n = e.statementToCode(t, "BODY") || `    pass
`;
  return `for box in ${o}.boxes:
${n}`;
};
r.forBlock.edgefirst_flow_if_label = function(t, e) {
  const o = t.getFieldValue("LABEL"), n = e.statementToCode(t, "BODY") || `    pass
`;
  return `if box.label == "${y(o)}":
${n}`;
};
r.forBlock.edgefirst_flow_if_confidence = function(t, e) {
  const o = t.getFieldValue("THRESHOLD"), n = e.statementToCode(t, "BODY") || `    pass
`;
  return `if box.confidence > ${o}:
${n}`;
};
r.forBlock.edgefirst_flow_log = function(t, e) {
  const o = t.getFieldValue("MESSAGE");
  return a(e, "import_logging", "import logging"), a(e, "module_logger", "logger = logging.getLogger(__name__)"), `logger.info("${y(o)}")
`;
};
function X() {
  P(), R(), G(), j(), W(), J();
}
function Q(t) {
  return t.replace(/^rt\//, "").replace(/\//g, "_").replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || "topic";
}
function ee() {
  if (r.__edgefirstRegistered) return;
  r.__edgefirstRegistered = !0;
  const t = r.init.bind(r), e = r.finish.bind(r);
  r.init = function(o) {
    t(o), this.edgefirst_ = {
      handlers: [],
      handlerCounter: 0
    };
  }, r.finish = function(o) {
    const n = this.edgefirst_;
    if (!n || n.handlers.length === 0)
      return e(o);
    a(this, "import_asyncio", "import asyncio"), a(this, "import_logging", "import logging"), a(this, "import_signal", "import signal"), a(this, "import_zenoh", "import zenoh"), a(this, "module_logger", "logger = logging.getLogger(__name__)");
    const c = this.definitions_, m = [];
    for (const [s, l] of Object.entries(c))
      s.startsWith("setup_") && m.push(l);
    for (const s of Object.keys(c))
      s.startsWith("setup_") && delete c[s];
    const p = e(o), D = [...n.handlers].sort(
      (s, l) => s.topic.localeCompare(l.topic)
    ), k = /* @__PURE__ */ new Map(), _ = D.map((s) => {
      let l = Q(s.topic);
      const d = k.get(l) ?? 0;
      return k.set(l, d + 1), d > 0 && (l = `${l}_${d}`), { ...s, slug: l };
    }), v = _.map((s) => {
      const d = (s.body || "").split(`
`), b = d.filter((f) => f.trim().length > 0), S = b.length > 0 ? Math.min(...b.map((f) => f.match(/^(\s*)/)?.[1].length ?? 0)) : 0, L = "            ", T = d.map((f) => {
        if (!f.trim()) return "";
        const w = f.slice(S);
        return L + w;
      }).join(`
`), U = T.trim() ? `
` + T : `
            pass`;
      return `async def handle_${s.slug}(drain, session):
    _consecutive_errors = 0
    while True:
        try:
            msg = await drain.get_latest()${U}
            _consecutive_errors = 0
        except Exception:
            _consecutive_errors += 1
            logger.warning("Error in handle_${s.slug}", exc_info=True)
            if _consecutive_errors >= 5:
                logger.error("handle_${s.slug}: %d consecutive errors, backing off", _consecutive_errors)
                await asyncio.sleep(1.0)`;
    }).join(`

`), x = _.map(
      (s) => `    ${s.slug}_drain = ${s.drainClass}(loop)
    sub_${s.slug} = session.declare_subscriber("${s.topic}", ${s.slug}_drain.callback)
    logger.info("Subscribing to ${s.topic}")`
    ).join(`

`), A = m.length > 0 ? `
` + m.join(`
`) + `
` : "";
    let g;
    if (_.length === 1) {
      const s = _[0];
      g = `    task = asyncio.create_task(
        handle_${s.slug}(${s.slug}_drain, session)
    )

    await stop.wait()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass`;
    } else {
      const s = _.map(
        (d) => `    task_${d.slug} = asyncio.create_task(
        handle_${d.slug}(${d.slug}_drain, session)
    )`
      ).join(`
`), l = _.map((d) => `task_${d.slug}`).join(", ");
      g = `${s}

    await stop.wait()
    for t in [${l}]:
        t.cancel()
    await asyncio.gather(${l}, return_exceptions=True)`;
    }
    const $ = _.map((s) => `        sub_${s.slug}.undeclare()`).join(`
`), h = (s) => s.split(`
`).map((l) => l.trim() ? "    " + l : l).join(`
`), F = `async def main():
    logging.basicConfig(level=logging.INFO)
${A}
    config = zenoh.Config()
    session = zenoh.open(config)
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    try:
${h(x)}

${h(g)}
    finally:
${$}
        session.close()`;
    return [p, v, F, `if __name__ == "__main__":
    asyncio.run(main())`].filter(
      (s) => s.trim()
    ).join(`


`) + `
`;
  };
}
const ne = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Zenoh",
      categoryStyle: "zenoh_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_zenoh_on_message",
          fields: { TOPIC: "rt/camera/dma" }
        },
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
      name: "Camera",
      categoryStyle: "camera_category",
      contents: [
        {
          kind: "block",
          type: "edgefirst_camera_frame"
        },
        {
          kind: "block",
          type: "edgefirst_camera_info"
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
          type: "edgefirst_model_run",
          inputs: {
            INPUT: {
              shadow: {
                type: "edgefirst_camera_frame"
              }
            }
          }
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
          type: "edgefirst_data_deserialize"
        },
        {
          kind: "block",
          type: "edgefirst_data_serialize"
        },
        {
          kind: "block",
          type: "edgefirst_data_box_field"
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
}, re = u.Theme.defineTheme("edgefirst", {
  name: "edgefirst",
  base: u.Themes.Classic,
  blockStyles: {
    hat_blocks: { colourPrimary: "#2962FF", hat: "cap" },
    zenoh_blocks: { colourPrimary: "#2962FF" },
    camera_blocks: { colourPrimary: "#2E7D32" },
    model_blocks: { colourPrimary: "#7B1FA2" },
    processing_blocks: { colourPrimary: "#E65100" },
    data_blocks: { colourPrimary: "#00838F" },
    flow_blocks: { colourPrimary: "#F9A825" }
  },
  categoryStyles: {
    zenoh_category: { colour: "#2962FF" },
    camera_category: { colour: "#2E7D32" },
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
}), ie = {
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
function ae() {
  X(), ee();
}
export {
  ie as CONNECTION_TYPES,
  a as addDefinition,
  re as edgefirstTheme,
  ne as edgefirstToolbox,
  y as escapePython,
  Z as getEdgeFirstState,
  ae as register,
  X as registerEdgeFirstBlocks,
  ee as registerEdgeFirstGenerators
};
//# sourceMappingURL=edgefirst-blockly.es.js.map
