<template>
  <view>
    <view class="card">
      <view class="muted" style="margin-bottom: 16rpx">每项可单独设置可见范围：族人可见 / 仅管理员 / 仅自己</view>
      <view v-for="k in CONTACT_FIELDS" :key="k" class="field">
        <view class="row">
          <text class="lbl">{{ CONTACT_FIELD_LABELS[k] }}</text>
          <picker class="grow" :range="visLabels" :value="VIS.indexOf(card.visibility[k] || 'members')" @change="(e: any) => (card.visibility[k] = VIS[e.detail.value])">
            <view class="vis">{{ CONTACT_VISIBILITY_LABELS[card.visibility[k] || 'members'] }} ▾</view>
          </picker>
        </view>
        <input class="input" v-model="card.fields[k]" :placeholder="`填写${CONTACT_FIELD_LABELS[k]}`" />
      </view>
      <button class="btn" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { CONTACT_FIELD_LABELS, CONTACT_FIELDS, CONTACT_VISIBILITY_LABELS, type ContactCard, type ContactVisibility } from '@zupu/shared';
import { m4, run } from '../../api';

const VIS: ContactVisibility[] = ['members', 'admins', 'private'];
const visLabels = VIS.map((v) => CONTACT_VISIBILITY_LABELS[v]);
const clanId = ref('');
const card = reactive<Pick<ContactCard, 'fields' | 'visibility'>>({ fields: {}, visibility: {} });

onLoad(async (o: any) => {
  clanId.value = o.clanId;
  const r = await run(m4.contacts.mine(clanId.value));
  if (r) Object.assign(card, { fields: { ...r.fields }, visibility: { ...r.visibility } });
});
async function save() {
  if (await run(m4.contacts.saveMine(clanId.value, card), '已保存')) setTimeout(() => uni.navigateBack(), 500);
}
</script>

<style scoped>
.field { margin-bottom: 8rpx; }
.lbl { font-weight: 600; width: 160rpx; }
.vis { text-align: right; color: #8a6d3b; font-size: 24rpx; padding: 8rpx 0; }
.input { margin-top: 8rpx; }
</style>
