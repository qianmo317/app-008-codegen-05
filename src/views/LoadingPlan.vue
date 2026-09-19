<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { getTask, saveTask, updateBox } from '../db';
import {
  TIER_LABEL,
  TIER_SHORT,
  TIER_COLOR,
  DIST_LABEL,
  LOAD_RULE_TEXT,
  tierOf,
  floorOf,
  distOf,
  ensureTrucks,
  createTruck,
  sanitizeTruck,
  occupiedByOthers,
  boxesOnTruck,
  sortBoxesForLoading,
  reorderTruck,
  reorderAfterBoxChange,
} from '../loading';
import { statusColor, statusLabel } from '../utils';
import type { MoveTask, Box, Truck, UnloadTier } from '../types';

const route = useRoute();
const task = ref<MoveTask | null>(null);

const tiers: UnloadTier[] = ['last', 'middle', 'first'];

async function load() {
  const t = await getTask(route.params.id as string);
  if (!t) return;
  const trucks = ensureTrucks(t);
  // 清洗历史脏数据：删掉不存在/重复的箱 id
  const validIds = new Set(t.boxes.map((b) => b.id));
  t.trucks = trucks.map((tr) => sanitizeTruck(tr, validIds));
  await saveTask(t);
  task.value = t;
}

onMounted(load);

async function persist() {
  if (task.value) await saveTask(task.value);
}

const trucks = computed(() => task.value?.trucks ?? []);

const assignedIds = computed(() => {
  const ids = new Set<string>();
  trucks.value.forEach((t) => t.boxIds.forEach((id) => ids.add(id)));
  return ids;
});

const poolBoxes = computed(() =>
  task.value ? task.value.boxes.filter((b) => !assignedIds.value.has(b.id)) : [],
);

function tierCount(truck: Truck, tier: UnloadTier): number {
  return boxesOnTruck(task.value!, truck).filter((b) => tierOf(b) === tier).length;
}

async function addTruck() {
  if (!task.value) return;
  const name = prompt('车辆名称', `车辆 ${trucks.value.length + 1}`);
  if (!name) return;
  ensureTrucks(task.value).push(createTruck(name));
  await persist();
}

async function renameTruck(truck: Truck) {
  const name = prompt('车辆名称', truck.name);
  if (name === null) return;
  truck.name = name.trim() || truck.name;
  await persist();
}

async function removeTruck(truck: Truck) {
  if (!task.value) return;
  if (!confirm(`删除「${truck.name}」？箱内打包件不会被删除，会回到待排区。`)) return;
  task.value.trucks = task.value.trucks!.filter((t) => t.id !== truck.id);
  await persist();
}

async function reorder(truck: Truck) {
  reorderTruck(task.value!, truck.id);
  await persist();
}

async function markLoaded(truck: Truck) {
  if (!task.value) return;
  if (!confirm(`将「${truck.name}」上的 ${truck.boxIds.length} 个打包件标记为已装车？`)) return;
  for (const b of boxesOnTruck(task.value, truck)) {
    b.status = 'loaded';
    b.updatedAt = Date.now();
    await updateBox(task.value.id, b);
  }
  await load();
}

async function move(truck: Truck, index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= truck.boxIds.length) return;
  const ids = truck.boxIds;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  truck.manual = true; // 临时挪位
  await persist();
}

async function removeFromTruck(truck: Truck, boxId: string) {
  truck.boxIds = truck.boxIds.filter((id) => id !== boxId);
  await persist();
}

async function addToTruck(truck: Truck, boxId: string) {
  if (truck.boxIds.includes(boxId)) return; // 同一辆车不许排两遍
  truck.boxIds.push(boxId);
  await persist();
}

async function autoFill(truck: Truck) {
  if (!task.value) return;
  const blocked = occupiedByOthers(task.value, truck.id);
  const candidates = poolBoxes.value.filter((b) => !blocked.has(b.id));
  const existing = new Set(truck.boxIds);
  sortBoxesForLoading(candidates)
    .map((b) => b.id)
    .forEach((id) => existing.add(id));
  truck.boxIds = [...existing];
  truck.manual = false;
  await persist();
}

// 改某个打包件的卸货档：保存后该件所在车辆的整份装车单跟着重排
async function changeTier(box: Box, tier: UnloadTier, truck?: Truck) {
  if (!task.value || tierOf(box) === tier) return;
  box.unloadTier = tier;
  box.updatedAt = Date.now();
  await updateBox(task.value.id, box);
  if (truck) reorderAfterBoxChange(task.value, box.id);
  await persist();
}

function boxById(id: string): Box | undefined {
  return task.value?.boxes.find((b) => b.id === id);
}
</script>

<template>
  <div v-if="task">
    <div class="header">
      <router-link :to="`/task/${task.id}`" class="back">←</router-link>
      <h1>装车排序</h1>
    </div>
    <div class="page">
      <div class="card" style="border-left:4px solid var(--primary);">
        <div style="font-weight:700;font-size:14px;">排序规则</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.6;">
          序号 1 最先装（车厢最内侧、最下方），卸货时按相反顺序搬出。{{ LOAD_RULE_TEXT }}。
        </div>
      </div>

      <div v-if="trucks.length === 0" class="empty">还没有车辆，点下面按钮建一张装车单</div>

      <div v-for="truck in trucks" :key="truck.id" class="card">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-weight:800;font-size:16px;flex:1;">🚚 {{ truck.name }}</div>
          <span class="tag" :style="{borderColor: TIER_COLOR.last, color: TIER_COLOR.last}">{{ tierCount(truck,'last') }} 后卸</span>
          <span class="tag" :style="{borderColor: TIER_COLOR.middle, color: TIER_COLOR.middle}">{{ tierCount(truck,'middle') }} 中间</span>
          <span class="tag" :style="{borderColor: TIER_COLOR.first, color: TIER_COLOR.first}">{{ tierCount(truck,'first') }} 先卸</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
          共 {{ truck.boxIds.length }} 件
          <span v-if="truck.manual" style="color:var(--warning);">· 已手动挪位（改档或一键重排会按规则复位）</span>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
          <button class="btn" style="padding:8px 12px;font-size:13px;" @click="reorder(truck)">按规则整份重排</button>
          <button class="btn btn-secondary" style="padding:8px 12px;font-size:13px;" @click="autoFill(truck)">待排件一键入车</button>
          <button class="btn btn-info" style="padding:8px 12px;font-size:13px;" @click="markLoaded(truck)">标记本车已装车</button>
          <button class="btn btn-secondary" style="padding:8px 12px;font-size:13px;" @click="renameTruck(truck)">改名</button>
          <button class="btn btn-danger" style="padding:8px 12px;font-size:13px;" @click="removeTruck(truck)">删车</button>
        </div>

        <div v-if="truck.boxIds.length === 0" class="empty" style="padding:16px 0;">空车，从下面待排区添加</div>

        <div
          v-for="(id, idx) in truck.boxIds"
          :key="id"
          style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border);"
        >
          <template v-if="boxById(id)">
            <div style="width:30px;height:30px;border-radius:8px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">
              {{ idx + 1 }}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;display:flex;align-items:center;gap:6px;">
                <span class="status-dot" :style="{background: statusColor(boxById(id)!.status)}"></span>
                {{ boxById(id)!.code }}
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">
                {{ boxById(id)!.roomTo }} · {{ floorOf(boxById(id)!) }}楼 · {{ DIST_LABEL[distOf(boxById(id)!)] }}
                · {{ boxById(id)!.weightKg ? boxById(id)!.weightKg + 'kg' : '重量未填' }}
                · {{ statusLabel(boxById(id)!.status) }}
              </div>
              <div style="display:flex;gap:4px;margin-top:5px;">
                <button
                  v-for="tier in tiers"
                  :key="tier"
                  class="tag"
                  style="padding:3px 8px;font-size:12px;"
                  :class="{active: tierOf(boxById(id)!) === tier}"
                  :style="tierOf(boxById(id)!) === tier ? {background: TIER_COLOR[tier], borderColor: TIER_COLOR[tier]} : {}"
                  @click="changeTier(boxById(id)!, tier, truck)"
                >
                  {{ TIER_SHORT[tier] }}
                </button>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
              <button class="tag" style="padding:2px 8px;" :disabled="idx === 0" @click="move(truck, idx, -1)">↑</button>
              <button class="tag" style="padding:2px 8px;" :disabled="idx === truck.boxIds.length - 1" @click="move(truck, idx, 1)">↓</button>
              <button class="tag" style="padding:2px 8px;color:var(--danger);" @click="removeFromTruck(truck, id)">移出</button>
            </div>
          </template>
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:4px;">待排区（{{ poolBoxes.length }} 件）</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
          先定好卸货档，再加入车辆；一件打包件只能上一辆车。
        </div>
        <div v-if="poolBoxes.length === 0" class="empty" style="padding:12px 0;">所有打包件都已排上装车单</div>
        <div
          v-for="box in poolBoxes"
          :key="box.id"
          style="padding:10px 0;border-top:1px solid var(--border);"
        >
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;display:flex;align-items:center;gap:6px;">
                <span class="status-dot" :style="{background: statusColor(box.status)}"></span>
                {{ box.code }}
                <span
                  style="font-size:11px;color:#fff;padding:2px 7px;border-radius:999px;"
                  :style="{ background: TIER_COLOR[tierOf(box)] }"
                >{{ TIER_SHORT[tierOf(box)] }}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">
                {{ box.roomTo }} · {{ floorOf(box) }}楼 · {{ DIST_LABEL[distOf(box)] }}
                · {{ box.weightKg ? box.weightKg + 'kg' : '重量未填' }}
              </div>
            </div>
            <select
              v-if="trucks.length"
              class="select"
              style="width:auto;padding:8px 10px;font-size:13px;flex-shrink:0;"
              :value="''"
              @change="addToTruck(trucks[Number(($event.target as HTMLSelectElement).value)], box.id); ($event.target as HTMLSelectElement).value=''"
            >
              <option value="" disabled>加入…</option>
              <option v-for="(t, i) in trucks" :key="t.id" :value="i">{{ t.name }}</option>
            </select>
          </div>
          <div style="display:flex;gap:4px;margin-top:6px;">
            <button
              v-for="tier in tiers"
              :key="tier"
              class="tag"
              style="padding:3px 8px;font-size:12px;"
              :class="{active: tierOf(box) === tier}"
              :style="tierOf(box) === tier ? {background: TIER_COLOR[tier], borderColor: TIER_COLOR[tier]} : {}"
              @click="changeTier(box, tier)"
            >
              {{ TIER_LABEL[tier] }}
            </button>
          </div>
        </div>
      </div>

      <button v-if="task.boxes.length" class="btn btn-secondary btn-block" @click="addTruck">＋ 增加一辆车</button>
      <div v-else class="empty">还没有打包件，先去封箱登记</div>
    </div>
  </div>
</template>
