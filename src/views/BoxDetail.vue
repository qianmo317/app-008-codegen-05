<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask, updateBox, deleteBox, saveTask } from '../db';
import { generateQRDataURL, statusColor, statusLabel } from '../utils';
import { TIER_SHORT, TIER_COLOR, DIST_LABEL, tierOf, floorOf, reorderAfterBoxChange } from '../loading';
import type { MoveTask, Box, BoxStatus, UnloadTier, DestDistance } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);
const box = ref<Box | null>(null);
const qrUrl = ref('');

const statuses: BoxStatus[] = ['packed', 'loaded', 'arrived', 'unpacked', 'damaged', 'missing'];
const tiers: UnloadTier[] = ['last', 'middle', 'first'];
const distances: DestDistance[] = [1, 2, 3];

async function load() {
  const t = await getTask(route.params.id as string);
  task.value = t;
  if (!t) return;
  const b = t.boxes.find((x) => x.code === (route.params.code as string));
  if (!b) return;
  box.value = b;
  qrUrl.value = await generateQRDataURL(t.id, b.code);
}

async function setStatus(s: BoxStatus) {
  if (!box.value || !task.value) return;
  box.value.status = s;
  box.value.updatedAt = Date.now();
  await updateBox(task.value.id, box.value);
}

// 修改影响装车次序的字段后，该箱所在车辆的整份装车单跟着重排
async function saveLoadAttrs() {
  if (!box.value || !task.value) return;
  box.value.updatedAt = Date.now();
  reorderAfterBoxChange(task.value, box.value.id);
  await saveTask(task.value);
  alert('已保存，装车单已按规则重排');
}

async function remove() {
  if (!box.value || !task.value) return;
  if (!confirm('确定删除此箱子？')) return;
  await deleteBox(task.value.id, box.value.id);
  router.push(`/task/${task.value.id}`);
}

onMounted(load);
</script>

<template>
  <div v-if="task && box">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>箱子详情 {{ box.code }}</h1>
    </div>
    <div class="page">
      <div class="qr-wrap">
        <img :src="qrUrl" alt="qr" />
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">扫码查看箱内物品</div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="status-dot" :style="{background: statusColor(box.status)}"></span>
          <span style="font-weight:700;">{{ statusLabel(box.status) }}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <button v-for="s in statuses" :key="s" class="tag" :class="{active: box.status === s}" @click="setStatus(s)">
            {{ statusLabel(s) }}
          </button>
        </div>
      </div>

      <div class="card">
        <div style="font-size:14px;color:var(--text-secondary);">目标房间</div>
        <div style="font-weight:700;">{{ box.roomTo }}</div>
      </div>
      <div class="card">
        <div style="font-size:14px;color:var(--text-secondary);">标签</div>
        <div>{{ box.tags.join(', ') || '无' }}</div>
      </div>
      <div class="card" v-if="box.fragile || box.liquid">
        <div style="font-size:14px;color:var(--text-secondary);">特殊标记</div>
        <div>{{ box.fragile ? '易碎 ' : '' }}{{ box.liquid ? '液体禁运' : '' }}</div>
      </div>
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px;">卸货与装车属性</div>
        <label class="label">卸货档</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
          <button
            v-for="t in tiers" :key="t" class="tag"
            :class="{active: tierOf(box) === t}"
            :style="tierOf(box) === t ? {background: TIER_COLOR[t], borderColor: TIER_COLOR[t]} : {}"
            @click="box.unloadTier = t"
          >{{ TIER_SHORT[t] }}</button>
        </div>
        <div class="grid-2">
          <div>
            <label class="label">新家楼层</label>
            <input v-model.number="box.destFloor" type="number" min="1" class="input" :placeholder="String(floorOf(box))" />
          </div>
          <div>
            <label class="label">距卸车点远近</label>
            <select v-model="box.destDist" class="select">
              <option v-for="d in distances" :key="d" :value="d">{{ d }} - {{ DIST_LABEL[d] }}</option>
            </select>
          </div>
        </div>
        <label class="label" style="margin-top:10px;">重量 (kg)</label>
        <input v-model.number="box.weightKg" type="number" class="input" placeholder="沉箱在同档内先装压底" />
        <button class="btn btn-block" style="margin-top:10px;" @click="saveLoadAttrs">保存并重排装车单</button>
      </div>
      <div class="card" v-if="box.photo">
        <img :src="box.photo" style="width:100%;border-radius:10px;" />
      </div>
      <div class="card" v-if="box.note">
        <div style="font-size:14px;color:var(--text-secondary);">备注</div>
        <div>{{ box.note }}</div>
      </div>

      <button class="btn btn-danger btn-block" @click="remove">删除此箱</button>
    </div>
  </div>
</template>
