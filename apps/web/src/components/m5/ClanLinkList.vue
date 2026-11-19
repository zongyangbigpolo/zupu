<template>
  <div>
    <el-empty v-if="!links.length" :description="emptyText ?? '暂无连谱记录'" :image-size="70" />
    <el-card v-for="l in links" :key="l.id" shadow="never" class="link" :class="{ active: l.id === activeId }">
      <div class="row">
        <el-tag :type="TAG[l.status]" effect="dark" size="small">{{ CLAN_LINK_STATUS_LABELS[l.status] }}</el-tag>
        <span v-if="l.direction" class="muted">{{ l.direction === 'outgoing' ? '本族发起' : '对方发起' }}</span>
        <span class="muted">{{ l.createdAt.slice(0, 10) }}</span>
        <div class="grow" />
        <el-button v-if="l.status === 'approved'" size="small" type="danger" plain @click="emit('open', l)">查看共同世系</el-button>
        <el-button v-if="l.canApprove" size="small" type="success" @click="startApprove(l)">同意</el-button>
        <el-button v-if="l.canApprove" size="small" @click="reject(l)">拒绝</el-button>
        <el-popconfirm v-if="l.canRevoke" :title="l.status === 'pending' ? '撤回该连谱申请？' : '解除连谱后双方族人将不能再跨族查看，确定？'" @confirm="revoke(l)">
          <template #reference><el-button size="small" link type="danger">{{ l.status === 'pending' ? '撤回' : '解除连谱' }}</el-button></template>
        </el-popconfirm>
      </div>
      <div class="sides">
        <div class="side">
          <div class="clan title-serif">{{ l.proposer.clan.name }}</div>
          <div class="muted">{{ l.proposer.clan.hallName || '' }} {{ l.proposer.clan.origin ? '· 郡望' + l.proposer.clan.origin : '' }}</div>
          <div class="anchor" v-if="l.proposer.person">
            对应人物：<b :class="l.proposer.person.gender">{{ l.proposer.person.fullName }}</b>
            <span class="muted" v-if="l.proposer.person.generation">（第{{ l.proposer.person.generation }}世）</span>
          </div>
        </div>
        <div class="eq">
          <el-icon :size="22"><Connection /></el-icon>
          <div class="muted">同一人</div>
        </div>
        <div class="side">
          <div class="clan title-serif">{{ l.target.clan.name }}</div>
          <div class="muted">{{ l.target.clan.hallName || '' }} {{ l.target.clan.origin ? '· 郡望' + l.target.clan.origin : '' }}</div>
          <div class="anchor" v-if="l.target.person">
            对应人物：<b :class="l.target.person.gender">{{ l.target.person.fullName }}</b>
            <span class="muted" v-if="l.target.person.generation">（第{{ l.target.person.generation }}世）</span>
          </div>
          <div class="anchor muted" v-else>待对方管理员选定本族对应人物</div>
        </div>
      </div>
      <div v-if="l.note" class="note">申请说明：{{ l.note }}</div>
      <div v-if="l.decisionNote" class="note">处理意见：{{ l.decisionNote }}</div>
    </el-card>

    <el-dialog v-model="approveOpen" title="同意连谱" width="520px">
      <template v-if="approving">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px"
          :title="`${approving.proposer.clan.name} 认为其谱中的「${approving.proposer.person?.fullName}」与本族某人是同一人。请选择本族对应的人物。`" />
        <el-form label-width="112px">
          <el-form-item label="本族对应人物" required>
            <PersonPicker v-model="approvePerson" :clan-id="approving.target.clan.id" placeholder="如：始祖、分支祖" />
          </el-form-item>
          <el-form-item label="处理意见"><el-input v-model="approveNote" type="textarea" :rows="2" maxlength="500" /></el-form-item>
        </el-form>
        <p class="muted">同意后，双方族人可查看对应人物的祖先链与后代支系，并可跨族查询亲属关系；其他成员数据仍按家族隔离，在世者隐私按访客处理。</p>
      </template>
      <template #footer>
        <el-button @click="approveOpen = false">取消</el-button>
        <el-button type="success" :disabled="!approvePerson" :loading="busy" @click="approve">确认同意</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { CLAN_LINK_STATUS_LABELS, type ClanLinkInfo, type ClanLinkStatus } from '@zupu/shared';
import { run } from '../../api';
import { m5api } from '../../m5-api';
import PersonPicker from '../PersonPicker.vue';

defineProps<{ links: ClanLinkInfo[]; activeId?: string | null; emptyText?: string }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'open', l: ClanLinkInfo): void }>();
const TAG: Record<ClanLinkStatus, 'warning' | 'success' | 'info' | 'danger'> = { pending: 'warning', approved: 'success', rejected: 'danger', revoked: 'info' };

const approveOpen = ref(false);
const approving = ref<ClanLinkInfo | null>(null);
const approvePerson = ref<string | null>(null);
const approveNote = ref('');
const busy = ref(false);

function startApprove(l: ClanLinkInfo) {
  approving.value = l;
  approvePerson.value = null;
  approveNote.value = '';
  approveOpen.value = true;
}
async function approve() {
  busy.value = true;
  const r = await run(m5api.clanLinks.approve(approving.value!.id, { personId: approvePerson.value!, note: approveNote.value || null }), '已同意连谱');
  busy.value = false;
  if (r) {
    approveOpen.value = false;
    emit('changed');
  }
}
async function reject(l: ClanLinkInfo) {
  const res = await ElMessageBox.prompt('可填写拒绝原因（选填）', '拒绝连谱', { inputPlaceholder: '如：经核对并非同源', confirmButtonText: '拒绝' }).catch(() => null);
  if (!res) return;
  if (await run(m5api.clanLinks.reject(l.id, res.value || null), '已拒绝')) emit('changed');
}
async function revoke(l: ClanLinkInfo) {
  if (await run(m5api.clanLinks.revoke(l.id), '已解除')) emit('changed');
}
</script>

<style scoped>
.link { margin-bottom: 12px; }
.link.active { border-color: var(--zp-red); }
.sides { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
.side { flex: 1; background: #fffaf0; border: 1px solid #eadfca; border-radius: 6px; padding: 10px 14px; }
.clan { font-size: 17px; color: var(--zp-red); }
.anchor { margin-top: 6px; }
.eq { display: flex; flex-direction: column; align-items: center; color: #c9a45c; }
.note { margin-top: 8px; color: #555; font-size: 13px; }
</style>
