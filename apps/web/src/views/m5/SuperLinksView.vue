<template>
  <div class="page">
    <el-page-header @back="router.push('/super')" title="平台管理">
      <template #content><span class="title-serif" style="font-size: 20px">连谱审批</span></template>
    </el-page-header>
    <el-alert type="info" :closable="false" show-icon style="margin-top: 12px"
      title="跨家族连谱一般由对方家族管理员同意；对方暂无管理员或需要平台介入时，超级管理员可代为审批（需在对方谱中选定同一人物）。" />
    <div style="margin-top: 16px"><ClanLinkList :links="links" empty-text="暂无待审批的连谱申请" @changed="load" /></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ClanLinkInfo } from '@zupu/shared';
import { run } from '../../api';
import { m5api } from '../../m5-api';
import ClanLinkList from '../../components/m5/ClanLinkList.vue';

const router = useRouter();
const links = ref<ClanLinkInfo[]>([]);
async function load() {
  links.value = (await run(m5api.clanLinks.pending())) ?? [];
}
onMounted(load);
</script>
