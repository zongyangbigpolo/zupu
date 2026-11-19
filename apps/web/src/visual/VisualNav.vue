<template>
  <el-button-group class="vnav">
    <el-button :icon="'MapLocation'" @click="go('migrations')">迁徙地图</el-button>
    <el-button :icon="'OfficeBuilding'" @click="go('sites')">祠堂祖坟</el-button>
    <el-button :icon="'Calendar'" @click="go('timeline')">家族时间轴</el-button>
    <el-button :icon="'Document'" @click="go('pedigree')">吊线谱</el-button>
  </el-button-group>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{ clanId: string }>();
const router = useRouter();
const go = (p: string) => router.push(`/clans/${props.clanId}/${p}`);
</script>
