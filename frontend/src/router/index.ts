import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import MainLayout from "../layouts/MainLayout.vue";
import HomePage from "../views/home-page/index.vue";
import DataProcessingPage from "../views//data-processing-page/index.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    component: MainLayout,
    children: [
      {
        path: "",
        name: "Home",
        component: HomePage,
      },
      {
        path: "data-view",
        name: "DataView",
        component: () => import("../views/data-view/index.vue"),
      },
      {
        path: "data-processing",
        name: "DataProcessing",
        component: DataProcessingPage,
      },
      {
        path: "data-source",
        name: "DataSource",
        component: () => import("../views/data-source/index.vue"),
      },
      {
        path: "workflow",
        name: "Workflow",
        component: () => import("../views/workflow/index.vue"),
      },
    ],
  },
  // 404 页面
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
