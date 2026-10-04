import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";

import { auth, checkSession, loginTarget } from "./data/auth";

const router = createRouter({
  history: window.location.protocol === "app:"
    ? createWebHashHistory()
    : createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("./views/LoginView.vue") },
    { path: "/", redirect: "/editor/demo" },
    {
      path: "/editor/:pageId",
      name: "editor",
      component: () => import("./views/EditorView.vue"),
    },
    {
      path: "/runtime/:pageId",
      name: "runtime",
      component: () => import("./views/RuntimeView.vue"),
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.name !== "editor" && to.name !== "runtime" && to.name !== "login") return true;
  try {
    await checkSession();
    if (to.name === "login") return auth.user ? loginTarget(to.query.redirect) : true;
    return auth.user ? true : { name: "login", query: { redirect: to.fullPath } };
  } catch {
    return to.name === "login" ? true : { name: "login", query: { redirect: to.fullPath, unavailable: "1" } };
  }
});

export default router;
