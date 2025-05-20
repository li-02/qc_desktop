import {createApp} from "vue";
import "./assets/style.css";
import App from "./App.vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import plusZhCn from "plus-pro-components/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import "@pureadmin/table/dist/style.css";
// 引入tailwindcss
import "./assets/tailwind.css";
import "animate.css";
// 引入路由
import router from "./router";
import PureTable from "@pureadmin/table";

const app = createApp(App);
app.use(ElementPlus, {
  locale: {...zhCn, ...plusZhCn},
});
// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}
app.use(ElementPlus);
app.use(PureTable, {locale: "zhCn"});
app.use(router);
app.mount("#app");
