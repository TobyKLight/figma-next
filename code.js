"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let zoomLevel = 1.0;
let padding = 48; //24
let interval;
var TransitionType;
(function (TransitionType) {
    TransitionType[TransitionType["Stop"] = 0] = "Stop";
    TransitionType[TransitionType["Passthrough"] = 1] = "Passthrough";
    TransitionType[TransitionType["Instant"] = 2] = "Instant";
})(TransitionType || (TransitionType = {}));
var Direction;
(function (Direction) {
    Direction[Direction["Prev"] = -3] = "Prev";
    Direction[Direction["Left"] = -2] = "Left";
    Direction[Direction["Up"] = -1] = "Up";
    Direction[Direction["Stop"] = 0] = "Stop";
    Direction[Direction["Down"] = 1] = "Down";
    Direction[Direction["Right"] = 2] = "Right";
    Direction[Direction["Next"] = 3] = "Next";
})(Direction || (Direction = {}));
let DirectionMap = {
    "1": "BOTTOM",
    "-1": "TOP",
    "2": "RIGHT",
    "-2": "LEFT"
};
let pageConnectors = [];
function endpointNodeId(endpoint) {
    return ("endpointNodeId" in endpoint) ? endpoint.endpointNodeId : null;
}
function endpointMagnet(endpoint) {
    return ("magnet" in endpoint) ? endpoint.magnet : undefined;
}
function nodeCenter(node) {
    const box = node.absoluteBoundingBox;
    if (!box)
        return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
function keyframeContains(parent, child) {
    var _a;
    if (!parent.children || !child.node)
        return false;
    for (const c of parent.children) {
        if (((_a = c.node) === null || _a === void 0 ? void 0 : _a.id) === child.node.id)
            return true;
        if (keyframeContains(c, child))
            return true;
    }
    return false;
}
function connectorsForNode(nodeId) {
    const fromAttached = [];
    const node = figma.getNodeById(nodeId);
    if (node && "attachedConnectors" in node && Array.isArray(node.attachedConnectors)) {
        fromAttached.push(...node.attachedConnectors);
    }
    const fromPage = pageConnectors.filter(connector => {
        const startId = endpointNodeId(connector.connectorStart);
        const endId = endpointNodeId(connector.connectorEnd);
        return startId === nodeId || endId === nodeId;
    });
    const byId = {};
    for (const c of fromAttached.concat(fromPage)) {
        byId[c.id] = c;
    }
    return Object.keys(byId).map(id => byId[id]);
}
function directionMatchesGeometry(direction, dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    switch (direction) {
        case Direction.Right: return dx > 0 && ax >= ay * 0.25;
        case Direction.Left: return dx < 0 && ax >= ay * 0.25;
        case Direction.Down: return dy > 0 && ay >= ax * 0.25;
        case Direction.Up: return dy < 0 && ay >= ax * 0.25;
        default: return false;
    }
}
function findConnectorHop(from, direction) {
    const wantedMagnet = DirectionMap[String(direction)];
    if (!wantedMagnet || !from.node)
        return undefined;
    const connectors = connectorsForNode(from.node.id);
    if (connectors.length === 0)
        return undefined;
    const fromCenter = nodeCenter(from.node);
    if (!fromCenter)
        return undefined;
    const candidates = [];
    for (const connector of connectors) {
        const startId = endpointNodeId(connector.connectorStart);
        const endId = endpointNodeId(connector.connectorEnd);
        if (!startId || !endId)
            continue;
        let otherId = null;
        let magnet;
        let fromIsStart = true;
        if (startId === from.node.id) {
            otherId = endId;
            magnet = endpointMagnet(connector.connectorStart);
            fromIsStart = true;
        }
        else if (endId === from.node.id) {
            otherId = startId;
            magnet = endpointMagnet(connector.connectorEnd);
            fromIsStart = false;
        }
        else {
            continue;
        }
        const other = keyframes.find(keyframe => { var _a; return ((_a = keyframe.node) === null || _a === void 0 ? void 0 : _a.id) === otherId; });
        if (!(other === null || other === void 0 ? void 0 : other.node))
            continue;
        const otherCenter = nodeCenter(other.node);
        if (!otherCenter)
            continue;
        const dx = otherCenter.x - fromCenter.x;
        const dy = otherCenter.y - fromCenter.y;
        const dist2 = dx * dx + dy * dy;
        const explicit = magnet === wantedMagnet;
        const looseMagnet = !magnet || magnet === "AUTO" || magnet === "CENTER" || magnet === "NONE";
        const geometric = looseMagnet && directionMatchesGeometry(direction, dx, dy);
        if (explicit || geometric) {
            candidates.push({ keyframe: other, connector, fromIsStart, explicit, dist2 });
        }
    }
    if (candidates.length === 0)
        return undefined;
    candidates.sort((a, b) => {
        if (a.explicit !== b.explicit)
            return a.explicit ? -1 : 1;
        return a.dist2 - b.dist2;
    });
    const best = candidates[0];
    return { keyframe: best.keyframe, connector: best.connector, fromIsStart: best.fromIsStart };
}
function connectorDirectionFor(direction) {
    if (DirectionMap[String(direction)])
        return direction;
    if (alwaysFollowConnectors) {
        if (direction === Direction.Next)
            return Direction.Right;
        if (direction === Direction.Prev)
            return Direction.Left;
    }
    return null;
}
/** Prefer diving into / out of nested slides over jumping along a connector. */
function shouldPreferNestedOverConnector(from, fromIndex, reverse) {
    if (!prioritiseNestedFrames)
        return false;
    const neighbor = keyframes[fromIndex + (reverse ? -1 : 1)];
    if (!neighbor)
        return false;
    return keyframeContains(from, neighbor) || keyframeContains(neighbor, from);
}
const DEFAULT_FIGJAM_FRAME_TYPES = {
    FRAME: true,
    SHAPE_WITH_TEXT: true,
    STICKY: true,
    TABLE: true,
    LINK_UNFURL: true,
    INSTANCE: true,
    WIDGET: true,
    SECTION: true,
};
const COMPACT_WIDTH = 72;
const COMPACT_HEIGHT = 36;
const SETTINGS_WIDTH = 280;
const SETTINGS_HEIGHT = 460;
let figjam = figma.editorType === "figjam";
let zoomModifier = 1.0;
let baseSpeed = 600;
let figjamFrameTypes = Object.assign({}, DEFAULT_FIGJAM_FRAME_TYPES);
let alwaysFollowConnectors = false;
let prioritiseNestedFrames = true;
let followConnectorPaths = false;
let showVerticalButtons = false;
let settingsOpen = false;
function compactSize() {
    return showVerticalButtons
        ? { width: 108, height: 108 }
        : { width: COMPACT_WIDTH, height: COMPACT_HEIGHT };
}
function getSettingsPayload() {
    return {
        type: "settingsState",
        speed: baseSpeed,
        isFigJam: figjam,
        figjamFrameTypes: Object.assign({}, figjamFrameTypes),
        alwaysFollowConnectors,
        prioritiseNestedFrames,
        followConnectorPaths,
        showVerticalButtons,
        settingsOpen,
    };
}
function postSettingsState() {
    figma.ui.postMessage(getSettingsPayload());
}
function persistSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        yield figma.clientStorage.setAsync("speed", baseSpeed);
        yield figma.clientStorage.setAsync("figjamFrameTypes", figjamFrameTypes);
        yield figma.clientStorage.setAsync("alwaysFollowConnectors", alwaysFollowConnectors);
        yield figma.clientStorage.setAsync("prioritiseNestedFrames", prioritiseNestedFrames);
        yield figma.clientStorage.setAsync("followConnectorPaths", followConnectorPaths);
        yield figma.clientStorage.setAsync("showVerticalButtons", showVerticalButtons);
    });
}
function loadSettings() {
    return __awaiter(this, void 0, void 0, function* () {
        const storedSpeed = yield figma.clientStorage.getAsync("speed");
        if (typeof storedSpeed === "number" && !isNaN(storedSpeed)) {
            baseSpeed = storedSpeed;
        }
        else {
            const pageSpeed = parseInt(figma.currentPage.getPluginData("speed"));
            if (!isNaN(pageSpeed)) {
                baseSpeed = pageSpeed;
                yield figma.clientStorage.setAsync("speed", baseSpeed);
            }
        }
        const storedTypes = yield figma.clientStorage.getAsync("figjamFrameTypes");
        if (storedTypes && typeof storedTypes === "object") {
            figjamFrameTypes = Object.assign(Object.assign({}, DEFAULT_FIGJAM_FRAME_TYPES), storedTypes);
        }
        const storedFollow = yield figma.clientStorage.getAsync("alwaysFollowConnectors");
        if (typeof storedFollow === "boolean") {
            alwaysFollowConnectors = storedFollow;
        }
        const storedNested = yield figma.clientStorage.getAsync("prioritiseNestedFrames");
        if (typeof storedNested === "boolean") {
            prioritiseNestedFrames = storedNested;
        }
        const storedPathFollow = yield figma.clientStorage.getAsync("followConnectorPaths");
        if (typeof storedPathFollow === "boolean") {
            followConnectorPaths = storedPathFollow;
        }
        const storedVertical = yield figma.clientStorage.getAsync("showVerticalButtons");
        if (typeof storedVertical === "boolean") {
            showVerticalButtons = storedVertical;
        }
    });
}
function isTypeEnabled(type) {
    if (!figjam) {
        return type === "FRAME" || type === "INSTANCE" || type === "WIDGET"
            || type === "SHAPE_WITH_TEXT" || type === "STICKY" || type === "TABLE"
            || type === "LINK_UNFURL";
    }
    return !!figjamFrameTypes[type];
}
function setSettingsOpen(open) {
    settingsOpen = open;
    if (open) {
        figma.ui.resize(SETTINGS_WIDTH, SETTINGS_HEIGHT);
    }
    else {
        const size = compactSize();
        figma.ui.resize(size.width, size.height);
    }
    postSettingsState();
}
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        yield loadSettings();
        const size = compactSize();
        figma.showUI(__html__, { visible: true, themeColors: true, width: size.width, height: size.height });
        figma.ui.onmessage = msg => {
            if (msg.type === 'menu') {
                setSettingsOpen(!settingsOpen);
                return;
            }
            if (msg.type === 'closeSettings') {
                setSettingsOpen(false);
                return;
            }
            if (msg.type === 'getSettings') {
                postSettingsState();
                return;
            }
            if (msg.type === 'setSettings') {
                let reloadFrames = false;
                let resizeCompact = false;
                if (typeof msg.speed === "number" && !isNaN(msg.speed) && msg.speed >= 0) {
                    baseSpeed = msg.speed;
                }
                if (typeof msg.alwaysFollowConnectors === "boolean") {
                    alwaysFollowConnectors = msg.alwaysFollowConnectors;
                }
                if (typeof msg.prioritiseNestedFrames === "boolean") {
                    prioritiseNestedFrames = msg.prioritiseNestedFrames;
                }
                if (typeof msg.followConnectorPaths === "boolean") {
                    followConnectorPaths = msg.followConnectorPaths;
                }
                if (typeof msg.showVerticalButtons === "boolean") {
                    if (showVerticalButtons !== msg.showVerticalButtons)
                        resizeCompact = true;
                    showVerticalButtons = msg.showVerticalButtons;
                }
                if (msg.figjamFrameTypes && typeof msg.figjamFrameTypes === "object") {
                    figjamFrameTypes = Object.assign(Object.assign({}, DEFAULT_FIGJAM_FRAME_TYPES), msg.figjamFrameTypes);
                    reloadFrames = true;
                }
                persistSettings().then(() => {
                    if (reloadFrames)
                        loadFrames();
                    if (resizeCompact && !settingsOpen) {
                        const size = compactSize();
                        figma.ui.resize(size.width, size.height);
                    }
                    postSettingsState();
                });
                return;
            }
            handleMessage(msg);
        };
        figma.on("currentpagechange", loadFrames);
        figma.on("documentchange", (event) => {
            const shouldReload = event.documentChanges.some(change => {
                return change.type === "CREATE" || change.type === "DELETE";
            });
            if (shouldReload)
                scheduleLoadFrames();
        });
        loadFrames();
        postSettingsState();
    });
}
let cameraPath;
let keyframes = [];
let currentKeyframe = undefined; //frames[0];
let currentIndex = -1;
let currentLength = 0;
let loadFramesTimer = null;
function scheduleLoadFrames() {
    if (loadFramesTimer != null) {
        clearTimeout(loadFramesTimer);
    }
    loadFramesTimer = setTimeout(() => {
        loadFramesTimer = null;
        loadFrames();
    }, 150);
}
function postNavState() {
    currentLength = cameraPath ? cameraPath.vectorNetwork.vertices.length : keyframes.length;
    const empty = currentLength === 0;
    const pastStart = currentIndex < 0;
    const pastEndBound = currentIndex >= currentLength;
    figma.ui.postMessage({
        index: currentIndex,
        length: currentLength,
        atEnd: empty || currentIndex === currentLength - 1,
        pastEnd: empty || pastEndBound || pastStart,
        atStart: empty || currentIndex === 0 || pastStart
    });
}
figma.on("selectionchange", () => {
    let selection = figma.currentPage.selection[0];
    if (selection) {
        while (selection.parent && selection.parent.type != "PAGE" && selection.parent.type != "SECTION") {
            console.log("selection", selection.parent, selection.parent.type);
            selection = selection.parent;
        }
    }
    keyframes.forEach(keyframe => {
        var _a, _b;
        if (selection === keyframe.node) {
            currentKeyframe = keyframe;
            if (cameraPath) {
                let ox = ((_a = cameraPath.absoluteBoundingBox) === null || _a === void 0 ? void 0 : _a.x) || 0;
                let oy = ((_b = cameraPath.absoluteBoundingBox) === null || _b === void 0 ? void 0 : _b.y) || 0;
                cameraPath.vectorNetwork.vertices.forEach((vertex, i) => {
                    let x = vertex.x + ox;
                    let y = vertex.y + oy;
                    if (pointInRect({ x, y }, selection.absoluteBoundingBox)) {
                        currentIndex = i;
                    }
                });
            }
            else {
                currentIndex = keyframes.indexOf(keyframe);
            }
            console.log("Selecting index: ", currentIndex, keyframe);
            return true;
        }
    });
});
function loadFrames() {
    var _a, _b;
    figma.skipInvisibleInstanceChildren = true;
    const previousId = (_a = currentKeyframe === null || currentKeyframe === void 0 ? void 0 : currentKeyframe.node) === null || _a === void 0 ? void 0 : _a.id;
    cameraPath = figma.currentPage.findChildren(node => {
        return node.type === "VECTOR" && (node.name.toLowerCase() == "journey" || node.name.toLowerCase() == "camera");
    }).pop();
    let framesInfo = [];
    let connectors = [];
    let sections = [];
    function sortFramesHorizontally(a, b) {
        if (Math.abs(a.y - b.y) < Math.max(a.height, b.height) / 2)
            return (a.x - b.x);
        return (a.y - b.y);
    }
    function sortFramesVertically(a, b) {
        if (Math.abs(a.x - b.x) < Math.max(a.width, b.width) / 2)
            return (a.y - b.y);
        return (a.x - b.x);
    }
    function traverse(node) {
        let childFrames = [];
        for (const child of node.children) {
            let type = child.type;
            let info = Object.assign({}, child.absoluteBoundingBox);
            info.node = child;
            switch (child.type) {
                case "FRAME":
                case "SHAPE_WITH_TEXT":
                case "STICKY":
                case "TABLE":
                case "LINK_UNFURL":
                case "INSTANCE":
                case "WIDGET":
                    if (isTypeEnabled(child.type)) {
                        childFrames.push(info);
                    }
                    break;
                case "SECTION":
                    info.children = traverse(child);
                    if (figjam && isTypeEnabled("SECTION")) {
                        childFrames.push(info);
                    }
                    ;
                    sections.push(child);
                    break;
                case "CONNECTOR":
                    connectors.push(child);
                    break;
                case "VECTOR":
                    // if (figjam) cameraPath = child as VectorNode;
                    break;
                default:
                    console.log("Unknown Type", type, child);
            }
        }
        return childFrames;
    }
    framesInfo = traverse(figma.currentPage);
    pageConnectors = connectors;
    console.log("connectors", connectors, sections, framesInfo, figma.currentPage);
    function sortAndFlatten(frames, sortFn) {
        let children = [];
        frames.sort(sortFn);
        frames.forEach(frame => {
            children.push(frame);
            if (frame.children) {
                children = children.concat(sortAndFlatten(frame.children, sortFn));
            }
        });
        return children;
    }
    let framesById = {};
    let vertFrames = sortAndFlatten(framesInfo, sortFramesVertically);
    for (let i = 0; i < vertFrames.length; i++) {
        let info = vertFrames[i];
        let id = (_b = info.node) === null || _b === void 0 ? void 0 : _b.id;
        if (id)
            framesById[id] = info;
        let next = vertFrames[i + 1];
        if (next) {
            info.vnext = next;
            next.vprev = info;
        }
    }
    let horizFrames = sortAndFlatten(framesInfo, sortFramesHorizontally);
    for (let i = 0; i < horizFrames.length; i++) {
        let info = horizFrames[i];
        let next = horizFrames[i + 1];
        if (next) {
            info.hnext = next;
            next.hprev = info;
            info.hindex = i;
        }
        info.connections = {};
    }
    keyframes = horizFrames;
    if (previousId) {
        const idx = keyframes.findIndex(k => { var _a; return ((_a = k.node) === null || _a === void 0 ? void 0 : _a.id) === previousId; });
        if (idx >= 0) {
            currentIndex = idx;
            currentKeyframe = keyframes[idx];
        }
        else {
            currentIndex = -1;
            currentKeyframe = undefined;
        }
    }
    else {
        currentIndex = -1;
        currentKeyframe = undefined;
    }
    let description = (keyframes.length.toString() + " frames");
    if (cameraPath)
        description = cameraPath.vectorNetwork.vertices.length.toString() + " points";
    console.log("Loaded Frames", keyframes, cameraPath);
    figma.currentPage.setRelaunchData({
        show: description
    });
    postNavState();
}
function handleMessage(msg) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    console.log("\nFrom UI:", msg);
    if (msg.type == 'zoom' && msg.direction) {
        let oldZoomModifier = zoomModifier;
        zoomModifier = Math.max(0.2, zoomModifier + msg.direction * 0.05);
        console.log("Set Zoom:", zoomModifier);
        figma.viewport.zoom *= zoomModifier / oldZoomModifier; // * lift;
        figma.currentPage.setPluginData("zoom", zoomModifier.toString());
        return;
    }
    if (msg.type == 'axis') {
        console.log("zoom", msg);
        return;
    }
    if (msg.type == 'speed' && msg.direction != undefined) {
        let speeds = [0, 999, 888, 777, 666, 555, 444, 333, 222, 111];
        baseSpeed = speeds[msg.direction];
        persistSettings().then(() => postSettingsState());
        console.log("set speed ", baseSpeed.toString());
        return;
    }
    if (msg.type === 'focusSelection') {
        const duration = ((_a = msg.event) === null || _a === void 0 ? void 0 : _a.shift) ? 2000 : baseSpeed;
        const selection = figma.currentPage.selection[0];
        if (!selection)
            return;
        if (cameraPath) {
            let node = selection;
            while (node.parent && node.parent.type != "PAGE" && node.parent.type != "SECTION") {
                node = node.parent;
            }
            const box = node.absoluteBoundingBox;
            if (!box)
                return;
            let ox = ((_b = cameraPath.absoluteBoundingBox) === null || _b === void 0 ? void 0 : _b.x) || 0;
            let oy = ((_c = cameraPath.absoluteBoundingBox) === null || _c === void 0 ? void 0 : _c.y) || 0;
            let found = -1;
            cameraPath.vectorNetwork.vertices.forEach((vertex, i) => {
                if (pointInRect({ x: vertex.x + ox, y: vertex.y + oy }, box))
                    found = i;
            });
            if (found < 0)
                return;
            currentIndex = found;
            const vertex = cameraPath.vectorNetwork.vertices[found];
            postNavState();
            animateToRect({ x: vertex.x + ox, y: vertex.y + oy }, duration);
            return;
        }
        let node = selection;
        let hitIndex = -1;
        while (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
            hitIndex = keyframes.findIndex(kf => kf.node && kf.node.id === node.id);
            if (hitIndex >= 0)
                break;
            node = node.parent;
        }
        if (hitIndex < 0)
            return;
        currentIndex = hitIndex;
        currentKeyframe = keyframes[hitIndex];
        const box = (_d = currentKeyframe === null || currentKeyframe === void 0 ? void 0 : currentKeyframe.node) === null || _d === void 0 ? void 0 : _d.absoluteBoundingBox;
        if (!box)
            return;
        postNavState();
        animateToRect(box, duration);
        return;
    }
    let transitionType = TransitionType.Stop;
    currentLength = cameraPath ? cameraPath.vectorNetwork.vertices.length : keyframes.length;
    let duration = msg.event.shift == true ? 2000 : baseSpeed;
    let direction = msg.direction || Direction.Stop;
    let vertical = direction == Direction.Up || direction == Direction.Down;
    let reverse = (msg.direction || 0) < 0;
    figma.currentPage.selection = [];
    if (cameraPath != null) {
        let segment = undefined;
        if (reverse) {
            segment = cameraPath.vectorNetwork.segments.find(segment => segment.end === currentIndex);
            if (segment)
                currentIndex = segment.start;
        }
        else {
            segment = cameraPath.vectorNetwork.segments.find(segment => segment.start === currentIndex);
            if (segment)
                currentIndex = segment.end;
        }
        if (currentIndex < 0)
            currentIndex = 0;
        if (currentIndex >= currentLength) {
            currentIndex = -1;
            return;
        }
        else {
        }
        console.log("New Index:", currentIndex);
        let vertex = cameraPath.vectorNetwork.vertices[currentIndex];
        let ox = ((_e = cameraPath.absoluteBoundingBox) === null || _e === void 0 ? void 0 : _e.x) || 0;
        let oy = ((_f = cameraPath.absoluteBoundingBox) === null || _f === void 0 ? void 0 : _f.y) || 0;
        let x = vertex.x + ox;
        let y = vertex.y + oy;
        let rect = { x, y };
        const frame = figma.currentPage
            .findChildren(node => node.type === "FRAME" && pointInRect({ x, y }, node.absoluteBoundingBox))
            .pop();
        if (segment) {
            let nextIndex = reverse ? segment.end : segment.start;
            let vertexEnd = cameraPath.vectorNetwork.vertices[nextIndex];
            let offset = { x: vertex.x - vertexEnd.x, y: vertex.y - vertexEnd.y };
            let types = { "MITER": TransitionType.Stop, "ROUND": TransitionType.Passthrough, "BEVEL": TransitionType.Instant };
            transitionType = types[vertex.strokeJoin || "MITER"];
            if (figjam)
                transitionType = TransitionType.Stop;
            let startCenter = figma.viewport.center;
            let scale;
            if (frame) {
                let frameBox = frame.absoluteBoundingBox;
                if (frameBox) {
                    let endCenter = { x: frameBox.x + (frameBox.width || 0) / 2, y: frameBox.y + (frameBox.height || 0) / 2 };
                    scale = {
                        x: offset.x ? (endCenter.x - startCenter.x) / offset.x : 1,
                        y: offset.y ? (endCenter.y - startCenter.y) / offset.y : 1
                    };
                }
            }
            if (reverse) {
                if (segment.tangentStart)
                    rect.tangentEnd = { x: segment.tangentStart.x || 0, y: segment.tangentStart.y || 0 };
                if (segment.tangentEnd)
                    rect.tangentStart = { x: segment.tangentEnd.x || 0, y: segment.tangentEnd.y || 0 };
            }
            else {
                if (segment.tangentStart)
                    rect.tangentStart = { x: segment.tangentStart.x || 0, y: segment.tangentStart.y || 0 };
                if (segment.tangentEnd)
                    rect.tangentEnd = { x: segment.tangentEnd.x || 0, y: segment.tangentEnd.y || 0 };
            }
            if (scale) {
                rect.tangentStart.x *= scale.x;
                rect.tangentStart.y *= scale.y;
                rect.tangentEnd.x *= scale.x;
                rect.tangentEnd.y *= scale.y;
            }
        }
        if (frame) {
            rect = Object.assign(rect, frame.absoluteBoundingBox);
        }
        if (transitionType == TransitionType.Instant)
            duration = 0;
        animateToRect(rect, duration);
        if (transitionType == TransitionType.Passthrough) {
            setTimeout(() => {
                delete msg.event.time;
                handleMessage(msg);
            }, duration);
        }
    }
    else {
        let prevNode = currentKeyframe;
        let nextKeyframe;
        let connectorHop;
        currentLength = keyframes.length;
        if (currentLength === 0) {
            currentIndex = -1;
            currentKeyframe = undefined;
            postNavState();
            return;
        }
        // Arrow keys always try connectors. Plugin-bar Prev/Next only if "always follow connectors" is on.
        const connectorDir = currentKeyframe ? connectorDirectionFor(direction) : null;
        if (connectorDir != null && currentKeyframe) {
            const preferNested = shouldPreferNestedOverConnector(currentKeyframe, currentIndex, reverse);
            if (!preferNested) {
                connectorHop = findConnectorHop(currentKeyframe, connectorDir);
                if (connectorHop)
                    nextKeyframe = connectorHop.keyframe;
            }
        }
        if (nextKeyframe) {
            currentIndex = keyframes.indexOf(nextKeyframe);
        }
        else if (currentKeyframe && vertical) {
            const neighbor = reverse ? currentKeyframe.vprev : currentKeyframe.vnext;
            if (neighbor) {
                currentKeyframe = neighbor;
                currentIndex = keyframes.indexOf(neighbor);
            }
            else {
                currentIndex = reverse ? -1 : currentLength;
            }
        }
        else {
            currentIndex += reverse ? -1 : 1;
        }
        postNavState();
        // Stay on sentinels: -1 = past start, length = past end (do not collapse both to -1)
        if (currentIndex < 0) {
            currentIndex = -1;
            currentKeyframe = undefined;
            return;
        }
        if (currentIndex >= currentLength) {
            currentIndex = currentLength;
            currentKeyframe = undefined;
            return;
        }
        currentKeyframe = keyframes[currentIndex];
        let laterFrame = reverse ? prevNode : currentKeyframe;
        if ((_h = (_g = laterFrame === null || laterFrame === void 0 ? void 0 : laterFrame.node) === null || _g === void 0 ? void 0 : _g.name) === null || _h === void 0 ? void 0 : _h.endsWith("•"))
            duration = 0;
        const box = (_j = currentKeyframe === null || currentKeyframe === void 0 ? void 0 : currentKeyframe.node) === null || _j === void 0 ? void 0 : _j.absoluteBoundingBox;
        if (!box)
            return;
        if (followConnectorPaths && connectorHop) {
            const fresh = figma.getNodeById(connectorHop.connector.id);
            const connectorNode = (fresh && fresh.type === "CONNECTOR")
                ? fresh
                : connectorHop.connector;
            const targetBox = box;
            const durationMs = Math.max(duration, 400);
            const fromIsStart = connectorHop.fromIsStart;
            connectorPathPointsAsync(connectorNode, fromIsStart).then(pathPoints => {
                console.log("Connector path follow", {
                    id: connectorNode.id,
                    lineType: connectorNode.connectorLineType,
                    points: pathPoints.length,
                    fromIsStart
                });
                if (pathPoints.length >= 2) {
                    animateAlongPoints(pathPoints, targetBox, durationMs);
                }
                else {
                    animateToRect(targetBox, duration);
                }
            });
            return;
        }
        animateToRect(box, duration);
    }
}
;
function pointInRect(p, rect) {
    if (!rect)
        return false;
    return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}
function transformLocalPoint(node, x, y) {
    const m = node.absoluteTransform;
    return {
        x: m[0][0] * x + m[0][1] * y + m[0][2],
        y: m[1][0] * x + m[1][1] * y + m[1][2]
    };
}
function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
function sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    const u = 1 - t;
    return {
        x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
    };
}
function sampleQuadratic(x0, y0, x1, y1, x2, y2, t) {
    const u = 1 - t;
    return {
        x: u * u * x0 + 2 * u * t * x1 + t * t * x2,
        y: u * u * y0 + 2 * u * t * y1 + t * t * y2
    };
}
function magnetPointOnBox(box, magnet, toward) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    switch (magnet) {
        case "TOP": return { x: cx, y: box.y };
        case "BOTTOM": return { x: cx, y: box.y + box.height };
        case "LEFT": return { x: box.x, y: cy };
        case "RIGHT": return { x: box.x + box.width, y: cy };
        case "CENTER": return { x: cx, y: cy };
        default: {
            if (!toward)
                return { x: cx, y: cy };
            const dx = toward.x - cx;
            const dy = toward.y - cy;
            if (Math.abs(dx) >= Math.abs(dy)) {
                return dx >= 0 ? { x: box.x + box.width, y: cy } : { x: box.x, y: cy };
            }
            return dy >= 0 ? { x: cx, y: box.y + box.height } : { x: cx, y: box.y };
        }
    }
}
function connectorEndpointPoint(endpoint, toward) {
    if (!("endpointNodeId" in endpoint)) {
        if ("position" in endpoint)
            return { x: endpoint.position.x, y: endpoint.position.y };
        return null;
    }
    const node = figma.getNodeById(endpoint.endpointNodeId);
    if (!node || node.removed)
        return null;
    const box = node.absoluteBoundingBox;
    if (!box)
        return null;
    if ("position" in endpoint && endpoint.position) {
        return { x: box.x + endpoint.position.x, y: box.y + endpoint.position.y };
    }
    return magnetPointOnBox(box, endpointMagnet(endpoint), toward);
}
function densifyPolyline(points, perSeg) {
    if (points.length < 2)
        return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        for (let s = 1; s <= perSeg; s++) {
            const u = s / perSeg;
            out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
        }
    }
    return out;
}
function pathEndpointScore(points, start, end) {
    if (points.length < 2)
        return Number.POSITIVE_INFINITY;
    return dist2(points[0], start) + dist2(points[points.length - 1], end);
}
function dedupePoints(points, eps = 1.5) {
    if (points.length === 0)
        return [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
        if (dist2(points[i], out[out.length - 1]) >= eps * eps)
            out.push(points[i]);
    }
    return out;
}
/**
 * Recover a centerline from a closed stroke *outline* ribbon (out one side, back the other).
 * Open paths are treated as already being a centerline (e.g. vector strokeGeometry).
 */
function strokeOutlineToCenterline(points, start, end) {
    let pts = dedupePoints(points, 0.75);
    if (pts.length < 2)
        return pts;
    const closed = dist2(pts[0], pts[pts.length - 1]) < 4;
    if (!closed)
        return sanitizeRoute(pts);
    pts = pts.slice(0, -1);
    if (pts.length < 6)
        return sanitizeRoute(pts);
    const nearestIdx = (target) => {
        let idx = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pts.length; i++) {
            const d = dist2(pts[i], target);
            if (d < best) {
                best = d;
                idx = i;
            }
        }
        return idx;
    };
    // Walk the closed loop from a → b in the given direction.
    const walk = (a, b, dir) => {
        const out = [pts[a]];
        let i = a;
        for (let n = 0; n < pts.length; n++) {
            i = (i + dir + pts.length) % pts.length;
            out.push(pts[i]);
            if (i === b)
                break;
        }
        return out;
    };
    if (start && end) {
        const startIdx = nearestIdx(start);
        const endIdx = nearestIdx(end);
        if (startIdx === endIdx)
            return sanitizeRoute(pts);
        const sideA = walk(startIdx, endIdx, 1);
        const sideB = walk(startIdx, endIdx, -1);
        // The two sides of the stroke ribbon — average them.
        const m = Math.max(sideA.length, sideB.length, 2);
        const center = [];
        for (let i = 0; i < m; i++) {
            const ai = Math.round(i * (sideA.length - 1) / (m - 1));
            const bi = Math.round(i * (sideB.length - 1) / (m - 1));
            center.push({
                x: (sideA[ai].x + sideB[bi].x) / 2,
                y: (sideA[ai].y + sideB[bi].y) / 2
            });
        }
        return sanitizeRoute(center);
    }
    // No attachments: split loop in half and average (weaker heuristic).
    const mid = Math.floor(pts.length / 2);
    const outbound = pts.slice(0, mid + 1);
    const inbound = pts.slice(mid).concat(pts.slice(0, 1));
    const revIn = inbound.slice().reverse();
    const m = Math.max(outbound.length, revIn.length, 2);
    const center = [];
    for (let i = 0; i < m; i++) {
        const oi = Math.round(i * (outbound.length - 1) / (m - 1));
        const ii = Math.round(i * (revIn.length - 1) / (m - 1));
        center.push({
            x: (outbound[oi].x + revIn[ii].x) / 2,
            y: (outbound[oi].y + revIn[ii].y) / 2
        });
    }
    return sanitizeRoute(center);
}
/** Drop spikes / reversals that cause camera flicker. */
function sanitizeRoute(points) {
    let pts = dedupePoints(points, 1);
    if (pts.length < 3)
        return pts;
    const out = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i++) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        const c = pts[i];
        const abx = b.x - a.x, aby = b.y - a.y;
        const bcx = c.x - b.x, bcy = c.y - b.y;
        const abLen = Math.sqrt(abx * abx + aby * aby);
        const bcLen = Math.sqrt(bcx * bcx + bcy * bcy);
        if (bcLen < 0.5)
            continue;
        if (abLen > 0.5) {
            const cos = (abx * bcx + aby * bcy) / (abLen * bcLen);
            if (cos < -0.55) {
                out[out.length - 1] = c;
                continue;
            }
        }
        out.push(c);
    }
    return dedupePoints(out, 1);
}
function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.sqrt(dist2(points[i - 1], points[i]));
    }
    return total;
}
function snapRouteEnds(points, start, end) {
    if (points.length < 2)
        return points;
    let pts = points.slice();
    if (pathEndpointScore(pts, end, start) < pathEndpointScore(pts, start, end)) {
        pts = pts.reverse();
    }
    pts[0] = { x: start.x, y: start.y };
    pts[pts.length - 1] = { x: end.x, y: end.y };
    return pts;
}
function prepareConnectorRoute(raw, start, end) {
    if (raw.length < 2)
        return raw;
    let points = strokeOutlineToCenterline(raw, start, end);
    if (start && end) {
        const forward = pathEndpointScore(points, start, end);
        const backward = pathEndpointScore(points, end, start);
        if (backward < forward)
            points = points.slice().reverse();
        // Only snap when the recovered line already gets near both attachments.
        if (routeConnectsEndpoints(points, start, end, 160)) {
            points = snapRouteEnds(points, start, end);
        }
    }
    return sanitizeRoute(points);
}
/** Parse SVG path `d` into separate subpaths (each M… / Z). Connector SVG is compound. */
function parsePathDataToSubpaths(data) {
    const tokens = data.replace(/,/g, " ").match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    if (!tokens)
        return [];
    const subpaths = [];
    let points = [];
    let i = 0;
    let cx = 0, cy = 0;
    let startX = 0, startY = 0;
    let lastCtrlX = 0, lastCtrlY = 0;
    let currentCmd = null;
    let subpathStarted = false;
    const read = () => parseFloat(tokens[i++]);
    const isCommand = (t) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(t);
    const flush = () => {
        if (points.length >= 2)
            subpaths.push(points);
        points = [];
        subpathStarted = false;
    };
    const push = (x, y) => {
        cx = x;
        cy = y;
        points.push({ x, y });
        subpathStarted = true;
    };
    while (i < tokens.length) {
        const token = tokens[i];
        if (isCommand(token)) {
            currentCmd = token;
            i++;
            if (currentCmd.toUpperCase() === "Z") {
                push(startX, startY);
                flush();
                currentCmd = null;
                continue;
            }
        }
        else if (!currentCmd) {
            break;
        }
        const cmd = currentCmd;
        const upper = cmd.toUpperCase();
        const rel = cmd !== upper;
        if (upper === "M") {
            let x = read(), y = read();
            if (rel) {
                x += cx;
                y += cy;
            }
            if (subpathStarted)
                flush();
            push(x, y);
            startX = cx;
            startY = cy;
            currentCmd = rel ? "l" : "L";
        }
        else if (upper === "L") {
            let x = read(), y = read();
            if (rel) {
                x += cx;
                y += cy;
            }
            push(x, y);
        }
        else if (upper === "H") {
            let x = read();
            if (rel)
                x += cx;
            push(x, cy);
        }
        else if (upper === "V") {
            let y = read();
            if (rel)
                y += cy;
            push(cx, y);
        }
        else if (upper === "C") {
            let x1 = read(), y1 = read(), x2 = read(), y2 = read(), x = read(), y = read();
            if (rel) {
                x1 += cx;
                y1 += cy;
                x2 += cx;
                y2 += cy;
                x += cx;
                y += cy;
            }
            for (let s = 1; s <= 10; s++) {
                const p = sampleCubic(cx, cy, x1, y1, x2, y2, x, y, s / 10);
                points.push(p);
            }
            lastCtrlX = x2;
            lastCtrlY = y2;
            cx = x;
            cy = y;
        }
        else if (upper === "S") {
            let x2 = read(), y2 = read(), x = read(), y = read();
            if (rel) {
                x2 += cx;
                y2 += cy;
                x += cx;
                y += cy;
            }
            const x1 = cx + (cx - lastCtrlX);
            const y1 = cy + (cy - lastCtrlY);
            for (let s = 1; s <= 10; s++) {
                const p = sampleCubic(cx, cy, x1, y1, x2, y2, x, y, s / 10);
                points.push(p);
            }
            lastCtrlX = x2;
            lastCtrlY = y2;
            cx = x;
            cy = y;
        }
        else if (upper === "Q") {
            let x1 = read(), y1 = read(), x = read(), y = read();
            if (rel) {
                x1 += cx;
                y1 += cy;
                x += cx;
                y += cy;
            }
            for (let s = 1; s <= 8; s++) {
                const p = sampleQuadratic(cx, cy, x1, y1, x, y, s / 8);
                points.push(p);
            }
            lastCtrlX = x1;
            lastCtrlY = y1;
            cx = x;
            cy = y;
        }
        else if (upper === "T") {
            let x = read(), y = read();
            if (rel) {
                x += cx;
                y += cy;
            }
            const x1 = cx + (cx - lastCtrlX);
            const y1 = cy + (cy - lastCtrlY);
            for (let s = 1; s <= 8; s++) {
                const p = sampleQuadratic(cx, cy, x1, y1, x, y, s / 8);
                points.push(p);
            }
            lastCtrlX = x1;
            lastCtrlY = y1;
            cx = x;
            cy = y;
        }
        else if (upper === "A") {
            read();
            read();
            read();
            read();
            read();
            let x = read(), y = read();
            if (rel) {
                x += cx;
                y += cy;
            }
            push(x, y);
        }
        else {
            break;
        }
    }
    flush();
    return subpaths;
}
/** True when a route actually runs from one connector attachment to the other. */
function routeConnectsEndpoints(points, start, end, tol = 120) {
    if (!start || !end || points.length < 2)
        return false;
    const tol2 = tol * tol;
    const a = points[0];
    const b = points[points.length - 1];
    return ((dist2(a, start) <= tol2 && dist2(b, end) <= tol2) ||
        (dist2(a, end) <= tol2 && dist2(b, start) <= tol2));
}
function parseStrokeGeometryPoints(connector) {
    const geometry = ("strokeGeometry" in connector)
        ? connector.strokeGeometry
        : null;
    if (!geometry || geometry.length === 0)
        return [];
    const start = connectorEndpointPoint(connector.connectorStart);
    const end = connectorEndpointPoint(connector.connectorEnd, start || undefined);
    let best = [];
    let bestScore = Number.POSITIVE_INFINITY;
    const box = connector.absoluteBoundingBox;
    for (const path of geometry) {
        const locals = parsePathDataToSubpaths(path.data);
        for (const local of locals) {
            if (local.length < 2)
                continue;
            const candidates = [
                local.map(p => transformLocalPoint(connector, p.x, p.y))
            ];
            if (box) {
                candidates.push(local.map(p => ({ x: box.x + p.x, y: box.y + p.y })));
            }
            for (const abs of candidates) {
                const route = prepareConnectorRoute(abs, start, end);
                const score = scoreCandidateRoute(route, start, end);
                if (score < bestScore || (score === bestScore && route.length > best.length)) {
                    bestScore = score;
                    best = route;
                }
            }
        }
    }
    return Number.isFinite(bestScore) ? best : [];
}
function bytesToString(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++)
        out += String.fromCharCode(bytes[i]);
    return out;
}
/** Prefer the stroke-body subpath; skip tiny caps / arrowheads. */
function isLikelyStrokeBodySubpath(local) {
    if (local.length < 8)
        return false;
    const len = polylineLength(local);
    if (len < 24)
        return false;
    return true;
}
function scoreCandidateRoute(route, start, end) {
    if (route.length < 2 || !start || !end)
        return Number.POSITIVE_INFINITY;
    if (!routeConnectsEndpoints(route, start, end, 160))
        return Number.POSITIVE_INFINITY;
    const endScore = pathEndpointScore(route, start, end);
    const len = polylineLength(route);
    const direct = Math.sqrt(dist2(start, end));
    // Reject routes that are still basically a doubled outline (way too long)
    // or impossibly short.
    if (direct > 1 && (len < direct * 0.45 || len > direct * 6 + 400)) {
        return Number.POSITIVE_INFINITY;
    }
    return endScore + len * 0.01;
}
function parseConnectorSvgPath(connector) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const bytes = yield connector.exportAsync({ format: "SVG" });
            const svg = bytesToString(bytes);
            const box = connector.absoluteBoundingBox;
            const paths = [];
            const addLocals = (locals) => {
                for (const local of locals) {
                    if (!isLikelyStrokeBodySubpath(local))
                        continue;
                    // Prefer absoluteTransform; also try bbox origin (SVG viewBox is often 0-based).
                    paths.push(local.map(p => transformLocalPoint(connector, p.x, p.y)));
                    if (box)
                        paths.push(local.map(p => ({ x: box.x + p.x, y: box.y + p.y })));
                }
            };
            const tagRe = /<path\b([^>]*)>/gi;
            let tagMatch;
            let matchedTags = 0;
            while ((tagMatch = tagRe.exec(svg)) != null) {
                matchedTags++;
                const dMatch = /\bd\s*=\s*"([^"]+)"/i.exec(tagMatch[1]);
                if (!dMatch)
                    continue;
                addLocals(parsePathDataToSubpaths(dMatch[1]));
            }
            if (matchedTags === 0) {
                const re = /d="([^"]+)"/g;
                let match;
                while ((match = re.exec(svg)) != null) {
                    addLocals(parsePathDataToSubpaths(match[1]));
                }
            }
            const start = connectorEndpointPoint(connector.connectorStart);
            const end = connectorEndpointPoint(connector.connectorEnd, start || undefined);
            let best = [];
            let bestScore = Number.POSITIVE_INFINITY;
            for (const abs of paths) {
                const route = prepareConnectorRoute(abs, start, end);
                const score = scoreCandidateRoute(route, start, end);
                if (score < bestScore || (score === bestScore && route.length > best.length)) {
                    bestScore = score;
                    best = route;
                }
            }
            return Number.isFinite(bestScore) ? best : [];
        }
        catch (e) {
            console.error("SVG connector export failed", e);
            return [];
        }
    });
}
/** Absolute canvas points along a connector, oriented from the hop's from-node toward the target.
 * Returns [] when no trustworthy centerline exists — caller should skip path-follow. */
function connectorPathPointsAsync(connector, fromIsStart) {
    return __awaiter(this, void 0, void 0, function* () {
        const start = connectorEndpointPoint(connector.connectorStart);
        const end = connectorEndpointPoint(connector.connectorEnd, start || undefined);
        let points = parseStrokeGeometryPoints(connector);
        if (points.length < 2) {
            points = yield parseConnectorSvgPath(connector);
        }
        if (points.length >= 2) {
            points = prepareConnectorRoute(points, start, end);
        }
        if (points.length < 2 || !routeConnectsEndpoints(points, start, end, 160)) {
            return [];
        }
        // Orient from the hop's "from" end toward the destination.
        if (start && end) {
            const wantStart = fromIsStart ? start : end;
            if (dist2(points[0], wantStart) > dist2(points[points.length - 1], wantStart)) {
                points = points.slice().reverse();
            }
        }
        else if (!fromIsStart) {
            points = points.slice().reverse();
        }
        return points;
    });
}
function pointAlongPolyline(points, t) {
    if (points.length === 1)
        return points[0];
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
        lengths.push(total);
    }
    if (total <= 0)
        return points[points.length - 1];
    const target = Math.max(0, Math.min(1, t)) * total;
    for (let i = 1; i < lengths.length; i++) {
        if (target <= lengths[i]) {
            const segLen = lengths[i] - lengths[i - 1];
            const u = segLen > 0 ? (target - lengths[i - 1]) / segLen : 1;
            return {
                x: points[i - 1].x + (points[i].x - points[i - 1].x) * u,
                y: points[i - 1].y + (points[i].y - points[i - 1].y) * u
            };
        }
    }
    return points[points.length - 1];
}
/** Ease in/out without overshoot (matches previous cosine ease). */
function easeInOut(t) {
    return 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, t)) * Math.PI);
}
/**
 * Zoom while traveling. Prefer a near-linear zoom so slow pans feel like middle-mouse
 * (constant scale). Only dip briefly when crossing many screenfuls on a short duration.
 */
function zoomAlongTravel(startZoom, endZoom, progress, distance, viewportSpan, durationMs) {
    const linear = startZoom + (endZoom - startZoom) * progress;
    const screens = distance / Math.max(1, viewportSpan);
    // Slow transitions, or short hops: keep zoom stable — dip reads as jitter.
    if (durationMs >= 500 || screens < 1.25)
        return linear;
    const dip = Math.min(0.28, (screens - 1.25) * 0.1) * Math.sin(progress * Math.PI);
    return linear * (1 - dip);
}
function fitZoomForRect(rect, fallbackZoom) {
    if (!rect.width || !rect.height)
        return fallbackZoom;
    const z = Math.min((figma.viewport.bounds.width * figma.viewport.zoom - padding * 2) / rect.width, (figma.viewport.bounds.height * figma.viewport.zoom - padding * 2) / rect.height) * zoomLevel;
    return z || fallbackZoom;
}
function stopViewportAnimation() {
    if (interval != null) {
        clearInterval(interval);
        interval = null;
    }
}
function runViewportAnimation(duration, sample, settle) {
    stopViewportAnimation();
    if (duration <= 0) {
        settle();
        return;
    }
    const start = Date.now();
    const end = start + duration;
    const tickMs = 1000 / 60;
    interval = setInterval(function () {
        const now = Date.now();
        const t = Math.min(1, Math.max(0, (now - start) / (end - start)));
        const progress = easeInOut(t);
        const frame = sample(progress);
        try {
            // Set zoom first, then center — avoids a one-frame mismatch when both change.
            figma.viewport.zoom = frame.zoom;
            figma.viewport.center = { x: frame.x, y: frame.y };
        }
        catch (e) {
            console.error("Viewport animate error", e);
        }
        if (now >= end) {
            stopViewportAnimation();
            settle();
        }
    }, tickMs);
}
function animateAlongPoints(points, endRect, duration) {
    const path = densifyPolyline(sanitizeRoute(points), 4);
    const endCenter = { x: endRect.x + (endRect.width || 0) / 2, y: endRect.y + (endRect.height || 0) / 2 };
    const route = sanitizeRoute([
        { x: figma.viewport.center.x, y: figma.viewport.center.y },
        ...path,
        endCenter
    ]);
    const startZoom = figma.viewport.zoom / zoomModifier;
    const endZoom = fitZoomForRect(endRect, startZoom);
    const viewportSpan = Math.max(figma.viewport.bounds.width, figma.viewport.bounds.height);
    let distance = 0;
    for (let i = 1; i < route.length; i++) {
        distance += Math.sqrt(dist2(route[i - 1], route[i]));
    }
    const dur = Math.max(duration, 400);
    runViewportAnimation(dur, (progress) => {
        const along = pointAlongPolyline(route, progress);
        return {
            x: along.x,
            y: along.y,
            zoom: zoomAlongTravel(startZoom, endZoom, progress, distance, viewportSpan, dur) * zoomModifier
        };
    }, () => {
        figma.viewport.zoom = endZoom * zoomModifier;
        figma.viewport.center = endCenter;
    });
}
function animateToRect(rect, duration) {
    if (!rect || rect.x == null || rect.y == null) {
        return;
    }
    const startCenter = figma.viewport.center;
    const endCenter = { x: rect.x + (rect.width || 0) / 2, y: rect.y + (rect.height || 0) / 2 };
    const bez = rect.tangentStart
        ? bezier([
            [startCenter.x, startCenter.y],
            [startCenter.x + rect.tangentStart.x, startCenter.y + rect.tangentStart.y],
            [endCenter.x + rect.tangentEnd.x, endCenter.y + rect.tangentEnd.y],
            [endCenter.x, endCenter.y]
        ])
        : bezier([
            [startCenter.x, startCenter.y],
            [endCenter.x, endCenter.y]
        ]);
    const distance = Math.sqrt(Math.pow(endCenter.x - startCenter.x, 2) + Math.pow(endCenter.y - startCenter.y, 2));
    const startZoom = figma.viewport.zoom / zoomModifier;
    const endZoom = fitZoomForRect(rect, startZoom);
    const viewportSpan = Math.max(figma.viewport.bounds.width, figma.viewport.bounds.height);
    runViewportAnimation(duration, (progress) => {
        const [x, y] = bez(progress);
        return {
            x: x || 0,
            y: y || 0,
            zoom: zoomAlongTravel(startZoom, endZoom, progress, distance, viewportSpan, duration) * zoomModifier
        };
    }, () => {
        figma.viewport.zoom = endZoom * zoomModifier;
        figma.viewport.center = endCenter;
    });
}
function lerp(start, end, p, f) {
    if (!f)
        f = (v) => v;
    return start + (end - start) * f(p);
}
/**
 * Given an array of control points, returns a function that computes the point on the bezier curve for a given parameter t.
 * @param pts An array of control points, where each control point is an array of numbers representing its coordinates.
 * @returns A function that takes a parameter t between 0 and 1, and returns an array of numbers representing the point on the bezier curve at that parameter.
 */
function bezier(pts) {
    // console.verbose("Creating Bezier", pts)
    return function (t) {
        // Initialize the current set of points to the input control points.
        let a = pts;
        let b;
        for (; a.length > 1; a = b) { // Repeatedly compute the next set of points until there is only one left.
            b = [];
            for (let i = 0, j; i < a.length - 1; i++) { // Compute each new point as an interpolation between adjacent points in the current set.
                b[i] = [];
                for (j = 0; j < a[i].length; j++) { // Compute the coordinates of the new point by interpolating between the adjacent points.
                    b[i][j] = a[i][j] * (1 - t) + a[i + 1][j] * t;
                }
            }
        }
        return a[0]; // Return the final point on the bezier curve.
    };
}
init();
