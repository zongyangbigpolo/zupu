<template>
  <div class="page" v-if="clan">
    <el-page-header @back="back" :title="isNew ? clan.name : form.surname + form.givenName">
      <template #content><span class="title-serif" style="font-size: 20px">{{ isNew ? '新增成员' : '编辑成员' }}</span></template>
    </el-page-header>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :md="14" :xs="24">
        <el-card shadow="never">
          <template #header><span class="card-title">基本信息</span></template>
          <el-form label-width="90px" size="default">
            <template v-if="isNew">
              <el-form-item label="父亲"><PersonPicker v-model="fatherId" :clan-id="clanId" :initial="fatherInit" placeholder="搜索父亲（选填）" /></el-form-item>
              <el-form-item label="母亲"><PersonPicker v-model="motherId" :clan-id="clanId" placeholder="搜索母亲（选填）" /></el-form-item>
            </template>
            <el-row>
              <el-col :span="12"><el-form-item label="姓" required><el-input v-model="form.surname" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="名" required><el-input v-model="form.givenName" @blur="check" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="字"><el-input v-model="form.courtesyName" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="号"><el-input v-model="form.artName" /></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="性别">
                  <el-radio-group v-model="form.gender"><el-radio value="male">男</el-radio><el-radio value="female">女</el-radio><el-radio value="unknown">未知</el-radio></el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="外姓">
                  <el-switch v-model="form.isExternal" @change="check" />
                  <span class="muted" style="margin-left: 8px">外姓配偶 / 女儿后代</span>
                </el-form-item>
              </el-col>
              <el-col :span="8"><el-form-item label="世代"><el-input-number v-model="form.generation" :min="1" controls-position="right" style="width: 100%" @change="check" /></el-form-item></el-col>
              <el-col :span="8">
                <el-form-item label="字辈">
                  <el-input v-model="form.generationChar" maxlength="2" @blur="check">
                    <template #append v-if="gc?.suggestedGenerationChar && gc.suggestedGenerationChar !== form.generationChar">
                      <el-button @click="applySuggest">用"{{ gc.suggestedGenerationChar }}"</el-button>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="8"><el-form-item label="排行"><el-input-number v-model="form.rankInSiblings" :min="1" controls-position="right" style="width: 100%" /></el-form-item></el-col>
            </el-row>
            <el-alert v-if="gc && (gc.warnings.length || suggestGen)" :type="gc.warnings.length ? 'warning' : 'info'" :closable="false" style="margin: 0 0 16px 90px; width: auto">
              <div v-if="suggestGen">字辈推算：第{{ gc.suggestedGeneration }}世{{ gc.suggestedGenerationChar ? `，"${gc.suggestedGenerationChar}"字辈` : '' }}
                <el-button link type="primary" @click="applySuggest">一键填入</el-button>
              </div>
              <div v-for="w in gc.warnings" :key="w">· {{ w }}</div>
            </el-alert>
            <el-row>
              <el-col :span="12"><el-form-item label="出生原文"><el-input v-model="form.birthText" placeholder="如：康熙三十年 / 1965年3月" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="出生日期">
                  <div class="row" style="width: 100%; flex-wrap: nowrap">
                    <el-date-picker v-model="form.birthDate" value-format="YYYY-MM-DD" type="date" style="width: 150px" />
                    <el-select v-model="form.birthPrecision" placeholder="精度" clearable style="width: 100px">
                      <el-option v-for="(l, k) in DATE_PRECISION_LABELS" :key="k" :value="k" :label="l" />
                    </el-select>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="在世"><el-switch v-model="form.isLiving" /></el-form-item></el-col>
              <el-col :span="12">
                <el-form-item label="隐私">
                  <el-select v-model="form.privacyLevel"><el-option v-for="(l, k) in PRIVACY_LABELS" :key="k" :value="k" :label="l" /></el-select>
                </el-form-item>
              </el-col>
              <template v-if="!form.isLiving">
                <el-col :span="12"><el-form-item label="去世原文"><el-input v-model="form.deathText" placeholder="如：乾隆五年" /></el-form-item></el-col>
                <el-col :span="12">
                  <el-form-item label="去世日期">
                    <div class="row" style="width: 100%; flex-wrap: nowrap">
                      <el-date-picker v-model="form.deathDate" value-format="YYYY-MM-DD" type="date" style="width: 150px" />
                      <el-select v-model="form.deathPrecision" placeholder="精度" clearable style="width: 100px">
                        <el-option v-for="(l, k) in DATE_PRECISION_LABELS" :key="k" :value="k" :label="l" />
                      </el-select>
                    </div>
                  </el-form-item>
                </el-col>
              </template>
              <el-col :span="12"><el-form-item label="祖籍"><el-input v-model="form.ancestralHome" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="出生地"><el-input v-model="form.birthPlace" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="葬地"><el-input v-model="form.burialPlace" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="职业"><el-input v-model="form.occupation" /></el-form-item></el-col>
            </el-row>
            <el-form-item label="生平"><RichEditor v-model="form.biography" /></el-form-item>
            <el-form-item>
              <el-button type="danger" :loading="saving" @click="save">保存</el-button>
              <el-button @click="back">取消</el-button>
              <el-popconfirm v-if="!isNew" title="确定删除此人？其亲子、婚姻关系与照片将一并删除" @confirm="remove">
                <template #reference><el-button type="danger" plain>删除</el-button></template>
              </el-popconfirm>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :md="10" :xs="24" v-if="detail">
        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">父母</span></template>
          <div v-for="r in detail.parents" :key="r.relationId" class="rel">
            <router-link :to="`/persons/${r.person.id}`" :class="r.person.gender" class="grow">{{ r.person.fullName }}</router-link>
            <el-select :model-value="r.relationType" size="small" style="width: 90px" @change="(v: any) => updatePc(r.relationId, { relationType: v })">
              <el-option v-for="(l, k) in RELATION_TYPE_LABELS" :key="k" :value="k" :label="l" />
            </el-select>
            <el-tooltip content="宗法主线：过继后嗣父一支为主线，本生父一支取消主线即为“出继”">
              <el-switch :model-value="r.isMainLine" size="small" active-text="主线" @change="(v: any) => updatePc(r.relationId, { isMainLine: v })" />
            </el-tooltip>
            <el-button link type="danger" :icon="'Delete'" @click="removePc(r.relationId)" />
          </div>
          <div class="row add">
            <PersonPicker v-model="newParent" :clan-id="clanId" placeholder="添加父/母" style="flex: 1" />
            <el-select v-model="newParentType" style="width: 90px"><el-option v-for="(l, k) in RELATION_TYPE_LABELS" :key="k" :value="k" :label="l" /></el-select>
            <el-button :disabled="!newParent" @click="addParent">添加</el-button>
          </div>
        </el-card>

        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">配偶</span></template>
          <div v-for="r in detail.spouses" :key="r.relationId" class="rel">
            <router-link :to="`/persons/${r.person.id}`" :class="r.person.gender" class="grow">{{ r.person.fullName }}</router-link>
            <el-select :model-value="r.marriageType" size="small" style="width: 90px" @change="(v: any) => updateMarriage(r.relationId, { type: v })">
              <el-option v-for="(l, k) in MARRIAGE_TYPE_LABELS" :key="k" :value="k" :label="l" />
            </el-select>
            <el-button link type="danger" :icon="'Delete'" @click="removeMarriage(r.relationId)" />
          </div>
          <div class="row add">
            <PersonPicker v-model="newSpouse" :clan-id="clanId" placeholder="选择已有人员为配偶" style="flex: 1" />
            <el-select v-model="newSpouseType" style="width: 90px"><el-option v-for="(l, k) in MARRIAGE_TYPE_LABELS" :key="k" :value="k" :label="l" /></el-select>
            <el-button :disabled="!newSpouse" @click="addSpouse">添加</el-button>
          </div>
          <p class="muted">外姓配偶请先"新增成员"（打开“外姓”开关），再在此关联。</p>
        </el-card>

        <el-card shadow="never" class="mb">
          <template #header>
            <div class="row"><span class="card-title grow">子女</span>
              <el-button size="small" type="danger" plain :icon="'Plus'" @click="router.push(`/clans/${clanId}/persons/new?parentId=${detail.id}`)">新增子女</el-button>
            </div>
          </template>
          <div v-for="r in detail.children" :key="r.relationId" class="rel">
            <router-link :to="`/persons/${r.person.id}/edit`" :class="r.person.gender" class="grow">{{ r.person.fullName }}</router-link>
            <span class="muted">{{ RELATION_TYPE_LABELS[r.relationType!] }}{{ r.isMainLine ? '' : '·出继' }}</span>
          </div>
        </el-card>

        <el-card shadow="never" class="mb">
          <template #header><span class="card-title">照片与影音</span></template>
          <el-upload :show-file-list="false" :http-request="upload" accept="image/*,video/*,audio/*" multiple>
            <el-button :icon="'Upload'" :loading="uploading">上传照片 / 视频 / 音频</el-button>
          </el-upload>
          <div class="media">
            <div v-for="m in detail.media" :key="m.id" class="mitem">
              <el-image v-if="m.type === 'photo'" :src="m.url" fit="cover" style="width: 90px; height: 90px" />
              <div v-else class="mph">{{ m.type === 'video' ? '视频' : m.type === 'audio' ? '音频' : '文档' }}</div>
              <div class="muted cap">{{ m.caption }}</div>
              <div class="row" style="gap: 2px">
                <el-button v-if="m.type === 'photo'" link size="small" :type="detail.avatarMediaId === m.id ? 'success' : 'default'" @click="setAvatar(m.id)">
                  {{ detail.avatarMediaId === m.id ? '头像' : '设为头像' }}
                </el-button>
                <el-button link size="small" type="danger" @click="removeMedia(m.id)">删除</el-button>
              </div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><span class="card-title">事迹</span></template>
          <div v-for="e in detail.events" :key="e.id" class="rel">
            <span class="grow">{{ e.eventText }} {{ e.title }}</span>
            <el-button link type="danger" :icon="'Delete'" @click="removeEvent(e.id)" />
          </div>
          <el-form :inline="true" size="small" style="margin-top: 8px">
            <el-form-item><el-input v-model="ev.title" placeholder="事件，如：迁居汉口" style="width: 150px" /></el-form-item>
            <el-form-item><el-input v-model="ev.eventText" placeholder="时间原文" style="width: 100px" /></el-form-item>
            <el-form-item><el-input v-model="ev.type" placeholder="类型" style="width: 70px" /></el-form-item>
            <el-form-item><el-button :disabled="!ev.title" @click="addEvent">添加</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus';
import {
  DATE_PRECISION_LABELS,
  MARRIAGE_TYPE_LABELS,
  PRIVACY_LABELS,
  RELATION_TYPE_LABELS,
  type ClanWithRole,
  type GenerationCheckResult,
  type Marriage,
  type ParentChild,
  type PersonDetail,
  type PersonInput,
  type RelationType,
  type MarriageType,
} from '@zupu/shared';
import { api, errorMessage, run, uploadMedia } from '../api';
import PersonPicker from '../components/PersonPicker.vue';
import RichEditor from '../components/RichEditor.vue';

const route = useRoute();
const router = useRouter();
const isNew = !route.params.id;
const clan = ref<ClanWithRole | null>(null);
const clanId = ref((route.params.clanId as string) ?? '');
const detail = ref<PersonDetail | null>(null);
const saving = ref(false);
const uploading = ref(false);
const gc = ref<GenerationCheckResult | null>(null);
const fatherId = ref<string | null>((route.query.parentId as string) || null);
const fatherInit = ref<{ id: string; fullName: string } | null>(null);
const motherId = ref<string | null>(null);
const newParent = ref<string | null>(null);
const newParentType = ref<RelationType>('biological');
const newSpouse = ref<string | null>(null);
const newSpouseType = ref<MarriageType>('principal');
const ev = reactive({ title: '', eventText: '', type: '' });

const empty = (): PersonInput => ({
  surname: '',
  givenName: '',
  courtesyName: null,
  artName: null,
  nickname: null,
  gender: 'male',
  generation: null,
  generationChar: null,
  rankInSiblings: null,
  birthDate: null,
  birthPrecision: null,
  birthText: null,
  deathDate: null,
  deathPrecision: null,
  deathText: null,
  isLiving: false,
  ancestralHome: null,
  birthPlace: null,
  burialPlace: null,
  biography: null,
  occupation: null,
  isExternal: false,
  privacyLevel: 'members',
});
const form = reactive<PersonInput>(empty());

const suggestGen = computed(
  () =>
    !!gc.value &&
    ((gc.value.suggestedGeneration != null && gc.value.suggestedGeneration !== form.generation) ||
      (!!gc.value.suggestedGenerationChar && gc.value.suggestedGenerationChar !== form.generationChar)),
);

async function check() {
  if (!clanId.value) return;
  gc.value =
    (await run(
      api.clans.generationCheck(clanId.value, {
        generation: form.generation ?? null,
        generationChar: form.generationChar || null,
        givenName: form.givenName || null,
        isExternal: form.isExternal,
        ...(isNew ? { parentIds: [fatherId.value, motherId.value].filter(Boolean) as string[] } : { personId: detail.value?.id }),
      }),
    )) ?? null;
}
function applySuggest() {
  if (!gc.value) return;
  if (gc.value.suggestedGeneration != null) form.generation = gc.value.suggestedGeneration;
  if (gc.value.suggestedGenerationChar) form.generationChar = gc.value.suggestedGenerationChar;
  check();
}
watch([fatherId, motherId], check);

async function loadDetail() {
  detail.value = (await run(api.persons.get(route.params.id as string))) ?? null;
  if (!detail.value) return;
  clanId.value = detail.value.clanId;
  for (const k of Object.keys(empty()) as (keyof PersonInput)[]) (form as any)[k] = (detail.value as any)[k];
}

onMounted(async () => {
  if (!isNew) await loadDetail();
  clan.value = (await run(api.clans.get(clanId.value))) ?? null;
  if (isNew) {
    form.surname = clan.value?.surname ?? '';
    if (fatherId.value) {
      const f = await run(api.persons.get(fatherId.value));
      if (f) {
        fatherInit.value = { id: f.id, fullName: f.fullName };
        form.surname = f.surname;
        const wife = f.spouses[0];
        if (wife && f.gender === 'male') motherId.value = wife.person.id;
      }
    }
  }
  check();
});

function back() {
  if (isNew) router.push(fatherId.value ? `/persons/${fatherId.value}/edit` : `/clans/${clanId.value}`);
  else router.push(`/persons/${route.params.id}`);
}

async function save() {
  if (!form.surname || !form.givenName) return ElMessage.warning('请填写姓名');
  saving.value = true;
  const body: any = { ...form };
  for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
  if (body.isLiving) Object.assign(body, { deathText: null, deathDate: null, deathPrecision: null });
  try {
    if (isNew) {
      const parents = [fatherId.value, motherId.value].filter(Boolean).map((id) => ({ parentId: id! }));
      const r = await api.clans.createPerson(clanId.value, { ...body, parents });
      if (r.warnings.length) ElMessage.warning({ message: '已保存，但请注意：' + r.warnings.join('；'), duration: 6000 });
      else ElMessage.success('已保存');
      router.push(`/persons/${r.person.id}/edit`);
    } else {
      const r = await api.persons.update(detail.value!.id, body);
      if (r.warnings.length) ElMessage.warning({ message: '已保存，但请注意：' + r.warnings.join('；'), duration: 6000 });
      else ElMessage.success('已保存');
      gc.value = { suggestedGeneration: r.person.generation, suggestedGenerationChar: r.person.generationChar, warnings: r.warnings };
    }
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (await run(api.persons.remove(detail.value!.id), '已删除')) router.push(`/clans/${clanId.value}`);
  else router.push(`/clans/${clanId.value}`);
}

async function addParent() {
  const ok = await run(
    api.clans.addParentChild(clanId.value, {
      parentId: newParent.value!,
      childId: detail.value!.id,
      relationType: newParentType.value,
      isMainLine: true,
    }),
    '已添加',
  );
  if (ok) {
    newParent.value = null;
    await loadDetail();
    check();
  }
}
async function updatePc(id: string, data: Partial<ParentChild>) {
  if (await run(api.relations.updateParentChild(id, data), '已更新')) await loadDetail();
}
async function removePc(id: string) {
  await ElMessageBox.confirm('确定解除该亲子关系？', '提示');
  if ((await run(api.relations.removeParentChild(id), '已解除')) !== undefined) await loadDetail();
  else await loadDetail();
}
async function addSpouse() {
  const me = detail.value!;
  const male = me.gender !== 'female';
  const ok = await run(
    api.clans.addMarriage(clanId.value, {
      husbandId: male ? me.id : newSpouse.value!,
      wifeId: male ? newSpouse.value! : me.id,
      type: newSpouseType.value,
    }),
    '已添加',
  );
  if (ok) {
    newSpouse.value = null;
    await loadDetail();
  }
}
async function updateMarriage(id: string, data: Partial<Marriage>) {
  if (await run(api.relations.updateMarriage(id, data), '已更新')) await loadDetail();
}
async function removeMarriage(id: string) {
  await ElMessageBox.confirm('确定解除该婚姻关系？', '提示');
  await run(api.relations.removeMarriage(id), '已解除');
  await loadDetail();
}
async function upload(opt: UploadRequestOptions) {
  uploading.value = true;
  try {
    await uploadMedia(detail.value!.id, opt.file);
    ElMessage.success('上传成功');
    await loadDetail();
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    uploading.value = false;
  }
}
async function setAvatar(mediaId: string) {
  if (await run(api.persons.update(detail.value!.id, { avatarMediaId: mediaId }), '已设为头像')) await loadDetail();
}
async function removeMedia(id: string) {
  await ElMessageBox.confirm('确定删除该文件？', '提示');
  await run(api.media.remove(id), '已删除');
  await loadDetail();
}
async function addEvent() {
  if (await run(api.persons.addEvent(detail.value!.id, { title: ev.title, eventText: ev.eventText || null, type: ev.type || null }), '已添加')) {
    Object.assign(ev, { title: '', eventText: '', type: '' });
    await loadDetail();
  }
}
async function removeEvent(id: string) {
  await run(api.events.remove(id), '已删除');
  await loadDetail();
}
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.rel { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #eee; }
.add { margin-top: 10px; flex-wrap: nowrap; }
.media { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.mitem { width: 96px; }
.mph { width: 90px; height: 90px; background: #f4efe4; display: flex; align-items: center; justify-content: center; }
.cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
</style>
