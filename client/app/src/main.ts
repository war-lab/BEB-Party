import { mount } from "svelte";
import "@beb/client-core/tokens.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("#app が見つからない");
}

mount(App, { target });
