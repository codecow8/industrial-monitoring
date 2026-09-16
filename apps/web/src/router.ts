import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
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

export default router;
