import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { title: '登录' } },
    { path: '/', component: () => import('./views/ClanListView.vue'), meta: { title: '我的族谱' } },
    { path: '/clans/:clanId', component: () => import('./views/ClanHomeView.vue'), meta: { title: '家族首页' } },
    { path: '/clans/:clanId/kinship', component: () => import('./views/KinshipView.vue'), meta: { title: '亲属关系' } },
    { path: '/clans/:clanId/admin', component: () => import('./views/ClanAdminView.vue'), meta: { title: '家族管理', login: true } },
    { path: '/clans/:clanId/persons/new', component: () => import('./views/PersonEditView.vue'), meta: { title: '新增成员', login: true } },
    { path: '/persons/:id', component: () => import('./views/PersonDetailView.vue'), meta: { title: '人物档案' } },
    { path: '/persons/:id/tree', component: () => import('./views/TreeView.vue'), meta: { title: '五代树' } },
    { path: '/persons/:id/edit', component: () => import('./views/PersonEditView.vue'), meta: { title: '编辑成员', login: true } },
    { path: '/super', component: () => import('./views/SuperAdminView.vue'), meta: { title: '平台管理', login: true, super: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuth();
  if (!auth.loaded) await auth.load();
  if ((to.meta.login || to.meta.super) && !auth.loggedIn) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.super && !auth.isSuper) return '/';
  document.title = `${to.meta.title ?? ''} · 族谱`;
});
