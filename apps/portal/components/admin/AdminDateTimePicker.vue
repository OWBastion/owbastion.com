<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { CalendarDate } from "@internationalized/date";

defineOptions({ name: "AdminDateTimePicker" });

const props = defineProps<{
  modelValue?: number | null;
  disabled?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: number | null): void;
}>();

function timestampToCalendarDate(ts?: number | null): CalendarDate | undefined {
  if (!ts || ts <= 0) return undefined;
  const d = new Date(ts);
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function timestampToTimeString(ts?: number | null): string {
  if (!ts || ts <= 0) return "00:00";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const calendarValue = ref<CalendarDate | undefined>(timestampToCalendarDate(props.modelValue));
const timeValue = ref<string>(timestampToTimeString(props.modelValue));

watch(
  () => props.modelValue,
  (newVal) => {
    calendarValue.value = timestampToCalendarDate(newVal);
    timeValue.value = timestampToTimeString(newVal);
  }
);

function updateModel() {
  if (!calendarValue.value) {
    emit("update:modelValue", null);
    return;
  }
  const year = calendarValue.value.year;
  const month = calendarValue.value.month - 1;
  const day = calendarValue.value.day;
  const [hours, minutes] = timeValue.value.split(":").map((num) => parseInt(num, 10) || 0);

  const d = new Date(year, month, day, hours, minutes, 0, 0);
  emit("update:modelValue", d.getTime());
}

function handleTimeChange(val: string) {
  timeValue.value = val;
  updateModel();
}

function clear() {
  calendarValue.value = undefined;
  timeValue.value = "00:00";
  emit("update:modelValue", null);
}

const dateValue = computed(() => {
  const date = calendarValue.value;
  return date ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}` : "";
});

function handleDateChange(value: string) {
  if (!value) {
    calendarValue.value = undefined;
    updateModel();
    return;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year && month && day) {
    calendarValue.value = new CalendarDate(year, month, day);
    updateModel();
  }
}
</script>

<template>
  <div class="datetime-picker flex flex-wrap items-center gap-1.5">
    <UInput
      type="date"
      class="min-w-0 flex-1"
      :placeholder="placeholder ?? '选择日期'"
      :aria-label="placeholder ?? '日期'"
      :model-value="dateValue"
      :disabled="disabled"
      @update:model-value="handleDateChange"
    />
    <UInput
      type="time"
      class="w-32"
      aria-label="具体时间"
      :model-value="timeValue"
      :disabled="disabled || !dateValue"
      @update:model-value="handleTimeChange"
    />
    <UButton
      v-if="modelValue"
      type="button"
      color="neutral"
      variant="ghost"
      size="xs"
      class="hit-target-lg"
      icon="i-lucide-x"
      aria-label="清除时间"
      :disabled="disabled"
      @click="clear"
    />
  </div>
</template>
