import { createRouter, createWebHistory } from 'vue-router';
import { heritageRoutes } from './heritage/routes';
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
    // M4 互动
    { path: '/clans/:clanId/contacts', component: () => import('./views/m4/ContactsView.vue'), meta: { title: '族人通讯录', login: true } },
    { path: '/clans/:clanId/activities', component: () => import('./views/m4/ActivitiesView.vue'), meta: { title: '活动与公告', login: true } },
    { path: '/activities/:id', component: () => import('./views/m4/ActivityDetailView.vue'), meta: { title: '活动详情', login: true } },
    { path: '/clans/:clanId/reminders', component: () => import('./views/m4/RemindersView.vue'), meta: { title: '生日忌日提醒', login: true } },
    { path: '/notifications', component: () => import('./views/m4/NotificationsView.vue'), meta: { title: '我的通知', login: true } },
    { path: '/super', component: () => import('./views/SuperAdminView.vue'), meta: { title: '平台管理', login: true, super: true } },
    // M5 扩展
    { path: '/clans/:clanId/links', component: () => import('./views/m5/ClanLinksView.vue'), meta: { title: '跨族连谱', login: true } },
    { path: '/clans/:clanId/gedcom', component: () => import('./views/m5/GedcomView.vue'), meta: { title: '数据导入导出', login: true } },
    { path: '/super/links', component: () => import('./views/m5/SuperLinksView.vue'), meta: { title: '连谱审批', login: true, super: true } },
    // M2 内容与传承
    ...heritageRoutes,
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuth();
  if (!auth.loaded) await auth.load();
  if ((to.meta.login || to.meta.super) && !auth.loggedIn) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.super && !auth.isSuper) return '/';
  document.title = `${to.meta.title ?? ''} · 族谱`;
});
