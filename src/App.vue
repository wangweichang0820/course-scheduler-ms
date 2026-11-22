<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
onMounted(() => store.init())
</script>
