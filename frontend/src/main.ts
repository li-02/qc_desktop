import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import ELementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ELementPlusIconsVue from '@element-plus/icons-vue'
// 引入tailwindcss
import './assets/tailwind.css'

const app=createApp(App)

// 注册所有ELement Plus图标
for(const [key,component] of Object.entries(ELementPlusIconsVue)){
    app.component(key,component)
}
app.use(ELementPlus)
app.mount('#app')
