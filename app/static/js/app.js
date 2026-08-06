import { injectIcons } from "./icons.js";
import { connectChat } from "./chat.js";
import { loadRoot } from "./tree.js";
import { initSplitter } from "./splitter.js";
import "./upload.js";

injectIcons();
loadRoot();
connectChat();
initSplitter();
