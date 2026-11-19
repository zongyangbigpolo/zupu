<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">家族相册</span></template>
    </el-page-header>
    <div class="row" style="margin: 16px 0">
      <el-radio-group v-model="type" @change="load(1)">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="photo">照片</el-radio-button>
        <el-radio-button value="video">视频</el-radio-button>
        <el-radio-button value="audio">音频</el-radio-button>
      </el-radio-group>
      <span class="muted">共 {{ data.total }} 项 · 照片在人物档案页上传（仅家族管理员）</span>
    </div>
    <div v-if="data.items.length" class="grid">
      <div v-for="m in data.items" :key="m.id" class="card" @click="open(m)">
        <div class="thumb">
          <img v-if="m.type === 'photo' || m.thumbnailUrl" :src="m.thumbnailUrl || m.url" loading="lazy" />
          <div v-else class="ph"><el-icon :size="40"><component :is="m.type === 'video' ? 'VideoPlay' : 'Headset'" /></el-icon></div>
          <span v-if="m.duration" class="badge">{{ fmtDuration(m.duration) }}</span>
        </div>
        <div class="meta">
          <div class="cap">{{ m.caption || '未命名' }}</div>
          <div class="muted small">
            <router-link :to="`/persons/${m.person.id}`" :class="m.person.gender" @click.stop>{{ m.person.fullName }}</router-link>
            <span v-if="m.person.generation"> · 第{{ m.person.generation }}世</span>
            <span v-if="m.takenText"> · {{ m.takenText }}</span>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无照片或影音" />
    <el-pagination
      v-if="data.total > data.pageSize"
      layout="prev, pager, next, total"
      :total="data.total"
      :page-size="data.pageSize"
      :current-page="data.page"
      style="margin-top: 16px"
      @current-change="load"
    />
    <el-image-viewer v-if="viewer >= 0" :url-list="photos.map((p) => p.url)" :initial-index="viewer" @close="viewer = -1" />
    <el-dialog v-model="avOpen" :title="av?.caption ?? ''" width="min(800px, 96vw)" destroy-on-close>
      <video v-if="av?.type === 'video'" :src="av.url" controls autoplay style="width: 100%" />
      <audio v-else-if="av" :src="av.url" controls autoplay style="width: 100%" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanGalleryItem, ClanWithRole, MediaType, Paged } from '@zupu/shared';
import { api, run } from '../../api';
import { fmtDuration, heritage } from '../api';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const type = ref<'' | MediaType>('');
const data = ref<Paged<ClanGalleryItem>>({ items: [], total: 0, page: 1, pageSize: 24 });
const viewer = ref(-1);
const av = ref<ClanGalleryItem | null>(null);
const avOpen = ref(false);
const photos = computed(() => data.value.items.filter((m) => m.type === 'photo'));

async function load(page = 1) {
  data.value = (await run(heritage.gallery.ofClan(clanId, { type: type.value || undefined, page, pageSize: 24 }))) ?? data.value;
}
function open(m: ClanGalleryItem) {
  if (m.type === 'photo') viewer.value = photos.value.indexOf(m);
  else if (m.type === 'doc') window.open(m.url);
  else {
    av.value = m;
    avOpen.value = true;
  }
}
onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  load(1);
});
</script>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #eadfca; border-radius: 8px; overflow: hidden; cursor: pointer; transition: box-shadow 0.2s; }
.card:hover { box-shadow: 0 6px 18px rgba(139, 30, 30, 0.15); }
.thumb { position: relative; aspect-ratio: 4 / 3; background: #f4efe4; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.ph { display: flex; height: 100%; align-items: center; justify-content: center; color: #b08a4a; }
.badge { position: absolute; right: 6px; bottom: 6px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 8px; }
.meta { padding: 8px 10px; }
.cap { font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.small { font-size: 12px; }
</style>
