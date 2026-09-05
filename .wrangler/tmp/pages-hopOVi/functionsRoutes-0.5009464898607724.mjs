import { onRequestDelete as __api_notes_js_onRequestDelete } from "D:\\Fluore Notes\\functions\\api\\notes.js"
import { onRequestGet as __api_notes_js_onRequestGet } from "D:\\Fluore Notes\\functions\\api\\notes.js"
import { onRequestPost as __api_notes_js_onRequestPost } from "D:\\Fluore Notes\\functions\\api\\notes.js"
import { onRequestPut as __api_notes_js_onRequestPut } from "D:\\Fluore Notes\\functions\\api\\notes.js"

export const routes = [
    {
      routePath: "/api/notes",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_notes_js_onRequestDelete],
    },
  {
      routePath: "/api/notes",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_notes_js_onRequestGet],
    },
  {
      routePath: "/api/notes",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_notes_js_onRequestPost],
    },
  {
      routePath: "/api/notes",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_notes_js_onRequestPut],
    },
  ]