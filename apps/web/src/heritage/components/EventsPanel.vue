<template>
  <div>
    <div v-if="admin" class="row" style="justify-content: flex-end; margin-bottom: 8px">
      <el-button size="small" type="danger" plain :icon="'Plus'" @click="openNew">添加事迹</el-button>
    </div>
    <el-timeline v-if="sorted.length">
      <el-timeline-item
        v-for="e in sorted"
        :key="e.id"
        :timestamp="[e.eventText || e.eventDate, e.place].filter(Boolean).join(' · ')"
        placement="top"
        :color="color(e.type)"
      >
        <div class="row" style="gap: 6px">
          <el-tag v-if="e.type" size="small" effect="plain">{{ e.type }}</el-tag>
          <b>{{ e.title }}</b>
          <template v-if="admin">
            <el-button link size="small" :icon="'Edit'" @click="openEdit(e)" />
            <el-popconfirm title="确定删除该事迹？" @confirm="remove(e.id)">
              <template #reference><el-button link size="small" type="danger" :icon="'Delete'" /></template>
            </el-popconfirm>
          </template>
        </div>
        <div v-if="e.description" class="muted desc">{{ e.description }}</div>
      </el-timeline-item>
    </el-timeline>
    <p v-else class="muted">暂无事迹记载</p>

    <el-dialog v-model="dlg" :title="editing ? '编辑事迹' : '添加事迹'" width="min(560px, 96vw)">
      <el-form label-width="80px">
        <el-form-item label="事件" required><el-input v-model="f.title" maxlength="100" placeholder="如：中举人、迁居汉口" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="f.type" filterable allow-create clearable placeholder="选择或输入" style="width: 200px">
            <el-option v-for="t in EVENT_TYPES" :key="t" :value="t" :label="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间(原文)"><el-input v-model="f.eventText" maxlength="60" placeholder="如：光绪二十年" /></el-form-item>
        <el-form-item label="公历日期">
          <el-date-picker v-model="f.eventDate" type="date" value-format="YYYY-MM-DD" placeholder="可选，用于排序" />
        </el-form-item>
        <el-form-item label="地点"><el-input v-model="f.place" maxlength="100" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="f.description" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="f.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="danger" :disabled="!f.title.trim()" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { LifeEvent } from '@zupu/shared';
import { api, run } from '../../api';

const EVENT_TYPES = ['出生', '迁徙', '科举', '任职', '从军', '经商', '婚嫁', '置业', '修谱', '建祠', '著述', '荣誉', '逝世', '其他'];
const props = defineProps<{ personId: string; events: LifeEvent[]; admin: boolean }>();
const emit = defineEmits<{ (e: 'changed'): void }>();
const dlg = ref(false);
const editing = ref<LifeEvent | null>(null);
const blank = { title: '', type: '', eventText: '', eventDate: '' as string | null, place: '', description: '', sortOrder: 0 };
const f = reactive({ ...blank });

const sorted = computed(() =>
  [...props.events].sort((a, b) => a.sortOrder - b.sortOrder || (a.eventDate ?? '9999').localeCompare(b.eventDate ?? '9999')),
);
const color = (t: string | null) => ({ 科举: '#c9a45c', 任职: '#8b1e1e', 迁徙: '#2f6fd6', 从军: '#4a7a3a', 逝世: '#666' })[t ?? ''] ?? '#b08a4a';

function openNew() {
  editing.value = null;
  Object.assign(f, blank);
  dlg.value = true;
}
function openEdit(e: LifeEvent) {
  editing.value = e;
  Object.assign(f, { title: e.title, type: e.type ?? '', eventText: e.eventText ?? '', eventDate: e.eventDate, place: e.place ?? '', description: e.description ?? '', sortOrder: e.sortOrder });
  dlg.value = true;
}
async function save() {
  const data = {
    title: f.title.trim(),
    type: f.type || null,
    eventText: f.eventText || null,
    eventDate: f.eventDate || null,
    place: f.place || null,
    description: f.description || null,
    sortOrder: f.sortOrder ?? 0,
  };
  const ok = editing.value ? await run(api.events.update(editing.value.id, data), '已保存') : await run(api.persons.addEvent(props.personId, data), '已添加');
  if (ok) {
    dlg.value = false;
    emit('changed');
  }
}
async function remove(id: string) {
  await run(api.events.remove(id), '已删除');
  emit('changed');
}
</script>

<style scoped>
.desc { margin-top: 4px; line-height: 1.7; white-space: pre-wrap; }
</style>
