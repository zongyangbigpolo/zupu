import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from './App.vue';
import { router } from './router';
import './style.css';

const app = createApp(App);
for (const [k, c] of Object.entries(Icons)) app.component(k, c);
app.use(createPinia()).use(router).use(ElementPlus, { locale: zhCn }).mount('#app');
