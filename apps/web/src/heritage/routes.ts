import type { RouteRecordRaw } from 'vue-router';

/** M2 内容与传承页面 */
export const heritageRoutes: RouteRecordRaw[] = [
  { path: '/clans/:clanId/gallery', component: () => import('./views/ClanGalleryView.vue'), meta: { title: '家族相册' } },
  { path: '/clans/:clanId/oral-histories', component: () => import('./views/OralHistoryListView.vue'), meta: { title: '口述历史' } },
  { path: '/clans/:clanId/documents', component: () => import('./views/ClanDocumentsView.vue'), meta: { title: '家训谱序' } },
  { path: '/clans/:clanId/stats', component: () => import('./views/ClanStatsView.vue'), meta: { title: '统计看板' } },
  { path: '/clans/:clanId/search', component: () => import('./views/AdvancedSearchView.vue'), meta: { title: '高级搜索' } },
  { path: '/persons/:id/memorial', component: () => import('./views/MemorialView.vue'), meta: { title: '人物纪念馆' } },
];
