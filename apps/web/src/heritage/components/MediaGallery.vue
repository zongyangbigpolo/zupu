<template>
  <div>
    <div class="row bar">
      <el-radio-group v-model="filter" size="small">
        <el-radio-button value="all">全部 {{ items.length }}</el-radio-button>
        <el-radio-button v-for="t in types" :key="t" :value="t">{{ MEDIA_TYPE_LABELS[t] }} {{ count(t) }}</el-radio-button>
      </el-radio-group>
      <div class="grow" />
      <el-upload v-if="admin" :show-file-list="false" :http-request="upload" accept="image/*,video/*,audio/*,application/pdf" multiple>
        <el-button size="small" type="danger" plain :icon="'Upload'" :loading="uploading > 0">上传照片 / 视频 / 音频</el-button>
      </el-upload>
    </div>

    <div v-if="shown.length" class="grid">
      <div v-for="m in shown" :key="m.id" class="item" @click="open(m)">
        <div class="thumb">
          <img v-if="m.type === 'photo' || m.thumbnailUrl" :src="m.thumbnailUrl || m.url" loading="lazy" />
          <div v-else class="ph"><el-icon :size="34"><component :is="iconOf(m)" /></el-icon></div>
          <span v-if="m.type !== 'photo'" class="badge">{{ MEDIA_TYPE_LABELS[m.type] }}{{ m.duration ? ' · ' + fmtDuration(m.duration) : '' }}</span>
        </div>
        <div class="cap" :title="m.caption ?? ''">{{ m.caption || '未命名' }}</div>
        <div v-if="m.takenText" class="muted small">{{ m.takenText }}</div>
      </div>
    </div>
    <el-empty v-else :image-size="60" description="暂无照片或影音资料" />

    <el-dialog v-model="viewer" :title="cur?.caption || '查看'" width="min(900px, 96vw)" destroy-on-close>
      <template v-if="cur">
        <div class="stage">
          <el-image v-if="cur.type === 'photo'" :src="cur.url" fit="contain" :preview-src-list="photos.map((p) => p.url)" :initial-index="photos.indexOf(cur)" style="max-height: 60vh" />
          <video v-else-if="cur.type === 'video'" :src="cur.url" :poster="cur.thumbnailUrl ?? undefined" controls autoplay style="max-width: 100%; max-height: 60vh" />
          <audio v-else-if="cur.type === 'audio'" :src="cur.url" controls autoplay style="width: 100%" />
          <a v-else :href="cur.url" target="_blank"><el-button :icon="'Document'">打开文档</el-button></a>
        </div>
        <el-descriptions :column="2" size="small" border style="margin-top: 12px">
          <el-descriptions-item label="类型">{{ MEDIA_TYPE_LABELS[cur.type] }} <span class="muted">{{ cur.mimeType }}</span></el-descriptions-item>
          <el-descriptions-item label="大小">{{ fmtSize(cur.size) }}</el-descriptions-item>
          <el-descriptions-item v-if="cur.width" label="尺寸">{{ cur.width }} × {{ cur.height }}</el-descriptions-item>
          <el-descriptions-item v-if="cur.duration" label="时长">{{ fmtDuration(cur.duration) }}</el-descriptions-item>
          <el-descriptions-item label="拍摄/录制">{{ cur.takenText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="上传于">{{ cur.createdAt.slice(0, 10) }}</el-descriptions-item>
          <el-descriptions-item v-if="cur.description" label="说明" :span="2">{{ cur.description }}</el-descriptions-item>
        </el-descriptions>
        <el-form v-if="admin" :inline="true" size="small" style="margin-top: 12px">
          <el-form-item label="标题"><el-input v-model="edit.caption" style="width: 180px" /></el-form-item>
          <el-form-item label="拍摄时间"><el-input v-model="edit.takenText" placeholder="如：1985年春" style="width: 130px" /></el-form-item>
          <el-form-item label="说明"><el-input v-model="edit.description" style="width: 240px" /></el-form-item>
          <el-form-item>
            <el-button type="primary" @click="save">保存</el-button>
            <el-button v-if="cur.type === 'photo'" @click="setAvatar">设为头像</el-button>
            <el-popconfirm title="确定删除该文件？" @confirm="remove"><template #reference><el-button type="danger">删除</el-button></template></el-popconfirm>
          </el-form-item>
        </el-form>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type UploadRequestOptions } from 'element-plus';
import { MEDIA_TYPE_LABELS, type GalleryMedia, type MediaType } from '@zupu/shared';
import { api, errorMessage, run } from '../../api';
import { fmtDuration, fmtSize, heritage, uploadGallery } from '../api';

const props = defineProps<{ personId: string; admin: boolean }>();
const emit = defineEmits<{ (e: 'changed'): void }>();
const items = ref<GalleryMedia[]>([]);
const filter = ref<'all' | MediaType>('all');
const uploading = ref(0);
const viewer = ref(false);
const cur = ref<GalleryMedia | null>(null);
const edit = reactive({ caption: '', takenText: '', description: '' });

const types: MediaType[] = ['photo', 'video', 'audio', 'doc'];
const count = (t: MediaType) => items.value.filter((m) => m.type === t).length;
const shown = computed(() => (filter.value === 'all' ? items.value : items.value.filter((m) => m.type === filter.value)));
const photos = computed(() => items.value.filter((m) => m.type === 'photo'));
const iconOf = (m: GalleryMedia) => (m.type === 'video' ? 'VideoPlay' : m.type === 'audio' ? 'Headset' : 'Document');

async function load() {
  items.value = (await run(heritage.gallery.ofPerson(props.personId))) ?? [];
}
onMounted(load);
defineExpose({ load });

function open(m: GalleryMedia) {
  cur.value = m;
  Object.assign(edit, { caption: m.caption ?? '', takenText: m.takenText ?? '', description: m.description ?? '' });
  viewer.value = true;
}
async function upload(opt: UploadRequestOptions) {
  uploading.value++;
  try {
    await uploadGallery(props.personId, opt.file);
    ElMessage.success(`已上传：${opt.file.name}`);
    await load();
    emit('changed');
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    uploading.value--;
  }
}
async function save() {
  const r = await run(heritage.gallery.update(cur.value!.id, { caption: edit.caption || null, takenText: edit.takenText || null, description: edit.description || null }), '已保存');
  if (r) {
    cur.value = r;
    await load();
  }
}
async function setAvatar() {
  if (await run(api.persons.update(props.personId, { avatarMediaId: cur.value!.id }), '已设为头像')) emit('changed');
}
async function remove() {
  await run(heritage.gallery.remove(cur.value!.id), '已删除');
  viewer.value = false;
  await load();
  emit('changed');
}
</script>

<style scoped>
.bar { margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.item { cursor: pointer; }
.thumb { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; background: #f4efe4; border: 1px solid #eadfca; }
.thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.item:hover img { transform: scale(1.04); }
.ph { display: flex; align-items: center; justify-content: center; height: 100%; color: #b08a4a; }
.badge { position: absolute; left: 6px; bottom: 6px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 8px; }
.cap { margin-top: 4px; font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.small { font-size: 11px; }
.stage { display: flex; justify-content: center; background: #111; border-radius: 6px; padding: 8px; }
</style>
