<template>
  <div>
    <div class="row" style="margin-bottom: 10px">
      <span class="muted grow">族中长辈讲述的往事，可录音或上传音频，并附文字整理稿。</span>
      <el-button v-if="admin" size="small" type="danger" plain :icon="'Microphone'" @click="openNew">录制 / 上传</el-button>
    </div>
    <el-empty v-if="!items.length" :image-size="60" description="暂无口述历史" />
    <div v-for="o in items" :key="o.id" class="oh">
      <div class="row">
        <b class="title-serif t">{{ o.title }}</b>
        <span class="muted">{{ [o.narrator && `讲述：${o.narrator}`, o.recordedText].filter(Boolean).join(' · ') }}</span>
        <div class="grow" />
        <template v-if="admin">
          <el-button link size="small" :icon="'Edit'" @click="openEdit(o)">整理稿</el-button>
          <el-popconfirm title="确定删除这条口述历史（含录音）？" @confirm="remove(o.id)">
            <template #reference><el-button link size="small" type="danger" :icon="'Delete'" /></template>
          </el-popconfirm>
        </template>
      </div>
      <audio v-if="o.audio?.type === 'audio'" :src="o.audio.url" controls preload="none" class="player" />
      <video v-else-if="o.audio?.type === 'video'" :src="o.audio.url" controls preload="none" class="player" style="max-height: 260px" />
      <el-collapse v-if="o.transcript" class="tr">
        <el-collapse-item :title="`文字整理稿（${o.transcript.length} 字）`">
          <div class="transcript">{{ o.transcript }}</div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <el-dialog v-model="dlg" :title="editing ? '编辑口述历史' : '新增口述历史'" width="min(640px, 96vw)" :close-on-click-modal="false" @closed="resetRecorder">
      <el-form label-width="90px">
        <el-form-item label="标题" required><el-input v-model="f.title" placeholder="如：爷爷讲修祠堂" maxlength="100" /></el-form-item>
        <el-form-item label="讲述人"><el-input v-model="f.narrator" placeholder="如：李德厚（族中长辈）" maxlength="60" /></el-form-item>
        <el-form-item label="录制时间"><el-input v-model="f.recordedText" placeholder="如：2024年清明" maxlength="60" /></el-form-item>
        <el-form-item v-if="!editing" label="录音">
          <div class="rec">
            <div class="row">
              <el-button v-if="rec.state === 'idle'" type="danger" :icon="'Microphone'" :disabled="!canRecord" @click="startRec">开始录音</el-button>
              <template v-else-if="rec.state !== 'done'">
                <span class="dot" :class="{ paused: rec.state === 'paused' }" />
                <b>{{ fmtDuration(rec.seconds) }}</b>
                <el-button v-if="rec.state === 'recording'" size="small" @click="pauseRec">暂停</el-button>
                <el-button v-else size="small" @click="resumeRec">继续</el-button>
                <el-button size="small" type="danger" @click="stopRec">结束</el-button>
              </template>
              <template v-else>
                <audio :src="rec.url" controls style="height: 36px" />
                <el-button size="small" link @click="resetRecorder">重录</el-button>
              </template>
              <span class="muted">或</span>
              <el-upload :auto-upload="false" :show-file-list="false" accept="audio/*,video/*" :on-change="pickFile">
                <el-button size="small" :icon="'Upload'">选择音频文件</el-button>
              </el-upload>
            </div>
            <div v-if="file" class="muted">已选择：{{ file.name }}</div>
            <div v-if="!canRecord" class="muted">当前浏览器不支持录音（需 HTTPS 与麦克风权限），请上传音频文件。</div>
          </div>
        </el-form-item>
        <el-form-item label="文字整理稿">
          <el-input v-model="f.transcript" type="textarea" :rows="8" placeholder="可选：录音内容的文字整理" />
          <el-tooltip content="AI 语音转写，敬请期待"><el-button size="small" disabled :icon="'MagicStick'" style="margin-top: 6px">AI 转写</el-button></el-tooltip>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="danger" :loading="saving" :disabled="!f.title || rec.state === 'recording' || rec.state === 'paused'" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, type UploadFile } from 'element-plus';
import type { OralHistory } from '@zupu/shared';
import { errorMessage, run } from '../../api';
import { fmtDuration, heritage, uploadOralHistory } from '../api';

const props = defineProps<{ personId: string; admin: boolean }>();
const items = ref<OralHistory[]>([]);
const dlg = ref(false);
const saving = ref(false);
const editing = ref<OralHistory | null>(null);
const f = reactive({ title: '', narrator: '', recordedText: '', transcript: '' });
const file = ref<File | null>(null);
const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
const rec = reactive<{ state: 'idle' | 'recording' | 'paused' | 'done'; seconds: number; url: string; blob: Blob | null }>({ state: 'idle', seconds: 0, url: '', blob: null });
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let timer: number | undefined;

async function load() {
  items.value = (await run(heritage.oralHistory.ofPerson(props.personId))) ?? [];
}
onMounted(load);
onBeforeUnmount(resetRecorder);

function openNew() {
  editing.value = null;
  Object.assign(f, { title: '', narrator: '', recordedText: '', transcript: '' });
  file.value = null;
  dlg.value = true;
}
function openEdit(o: OralHistory) {
  editing.value = o;
  Object.assign(f, { title: o.title, narrator: o.narrator ?? '', recordedText: o.recordedText ?? '', transcript: o.transcript ?? '' });
  dlg.value = true;
}
function pickFile(u: UploadFile) {
  resetRecorder();
  file.value = u.raw ?? null;
}

async function startRec() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    ElMessage.error('无法使用麦克风，请检查浏览器权限');
    return;
  }
  file.value = null;
  const chunks: Blob[] = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    rec.blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    rec.url = URL.createObjectURL(rec.blob);
    rec.state = 'done';
    stream?.getTracks().forEach((t) => t.stop());
  };
  recorder.start(1000);
  rec.state = 'recording';
  rec.seconds = 0;
  timer = window.setInterval(() => rec.state === 'recording' && rec.seconds++, 1000);
}
function pauseRec() {
  recorder?.pause();
  rec.state = 'paused';
}
function resumeRec() {
  recorder?.resume();
  rec.state = 'recording';
}
function stopRec() {
  clearInterval(timer);
  recorder?.stop();
}
function resetRecorder() {
  clearInterval(timer);
  if (recorder && recorder.state !== 'inactive') {
    recorder.onstop = null;
    recorder.stop();
  }
  stream?.getTracks().forEach((t) => t.stop());
  if (rec.url) URL.revokeObjectURL(rec.url);
  recorder = null;
  stream = null;
  Object.assign(rec, { state: 'idle', seconds: 0, url: '', blob: null });
}

async function save() {
  saving.value = true;
  try {
    if (editing.value) {
      await heritage.oralHistory.update(editing.value.id, { title: f.title, narrator: f.narrator || null, recordedText: f.recordedText || null, transcript: f.transcript || null });
    } else {
      const audio = rec.blob ?? file.value;
      if (!audio && !f.transcript.trim()) {
        ElMessage.warning('请录音、上传音频或填写文字整理稿');
        return;
      }
      const ext = rec.blob ? (rec.blob.type.includes('mp4') ? 'm4a' : 'webm') : '';
      await uploadOralHistory(
        props.personId,
        audio,
        { ...f, duration: rec.blob ? rec.seconds : undefined },
        rec.blob ? `录音-${new Date().toISOString().slice(0, 10)}.${ext}` : undefined,
      );
    }
    ElMessage.success('已保存');
    dlg.value = false;
    await load();
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
async function remove(id: string) {
  await run(heritage.oralHistory.remove(id), '已删除');
  await load();
}
</script>

<style scoped>
.oh { padding: 10px 0; border-bottom: 1px dashed #eadfca; }
.t { font-size: 16px; color: var(--zp-red); }
.player { width: 100%; margin-top: 6px; }
.tr { margin-top: 6px; border: none; }
.transcript { white-space: pre-wrap; line-height: 1.9; color: #444; font-family: 'Songti SC', 'STSong', serif; font-size: 15px; }
.rec { width: 100%; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #e33; animation: blink 1s infinite; }
.dot.paused { animation: none; background: #aaa; }
@keyframes blink { 50% { opacity: 0.2; } }
</style>
