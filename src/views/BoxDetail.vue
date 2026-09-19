<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTask, updateBox, deleteBox, setBoxUnloadTier } from '../db';
import { generateQRDataURL, statusColor, statusLabel, UNLOAD_TIERS, tierOf, tierLabel } from '../utils';
import type { MoveTask, Box, BoxStatus, UnloadTier } from '../types';

const route = useRoute();
const router = useRouter();
const task = ref<MoveTask | null>(null);
const box = ref<Box | null>(null);
const qrUrl = ref('');
const floorTo = ref<number | null>(null);
const distanceKm = ref<number | null>(null);

const statuses: BoxStatus[] = ['packed', 'loaded', 'arrived', 'unpacked', 'damaged', 'missing'];

async function load() {
  const t = await getTask(route.params.id as string);
  task.value = t;
  if (!t) return;
  const b = t.boxes.find((x) => x.code === (route.params.code as string));
  if (!b) return;
  box.value = b;
  floorTo.value = b.floorTo ?? null;
  distanceKm.value = b.distanceKm ?? null;
  qrUrl.value = await generateQRDataURL(t.id, b.code);
}

async function setStatus(s: BoxStatus) {
  if (!box.value || !task.value) return;
  box.value.status = s;
  box.value.updatedAt = Date.now();
  await updateBox(task.value.id, box.value);
}

async function setTier(t: UnloadTier) {
  if (!box.value || !task.value) return;
  await setBoxUnloadTier(task.value.id, box.value.id, t); // 整份装车单跟着重排
  box.value.unloadTier = t;
}

async function savePlacement() {
  if (!box.value || !task.value) return;
  box.value.floorTo = floorTo.value ?? undefined;
  box.value.distanceKm = distanceKm.value ?? undefined;
  box.value.updatedAt = Date.now();
  await updateBox(task.value.id, box.value); // updateBox 内会重排装车单
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
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">卸货先后（改档后整份装车单自动重排）</div>
        <div style="display:flex;gap:8px;">
          <button
            v-for="t in UNLOAD_TIERS"
            :key="t"
            class="tag"
            :class="{active: tierOf(box) === t}"
            @click="setTier(t)"
          >{{ tierLabel(t) }}</button>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <div style="flex:1;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">目标楼层</div>
            <input v-model.number="floorTo" type="number" min="0" class="input" @change="savePlacement" />
          </div>
          <div style="flex:1;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">目的地距离 (km)</div>
            <input v-model.number="distanceKm" type="number" min="0" class="input" placeholder="可选" @change="savePlacement" />
          </div>
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
      <div class="card" v-if="box.weightKg">
        <div style="font-size:14px;color:var(--text-secondary);">重量</div>
        <div>{{ box.weightKg }} kg</div>
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
