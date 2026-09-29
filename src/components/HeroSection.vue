<template>
  <section class="ns-hero">
    <div class="ns-hero-inner">

      <p class="ns-hero-eyebrow">Neuroarchitecture Lab · IAAC MACAD 2025–2026</p>

      <h1 class="ns-hero-title">
        Neuro<span>Space</span>
      </h1>
      <p class="ns-hero-subtitle">Designing for Neurological Wellbeing</p>
      <p class="ns-hero-tagline">Turning BIM into Behavior Information Modeling</p>

      <p class="ns-hero-description">
        An interactive tool that lets you design a parametric space through the lens of
        neuroarchitecture. Manipulate spatial variables — curvature, surface geometry, scale,
        daylight access, and biophilic elements — and watch how your design affects a live
        <strong>NeuroScore</strong>, an estimate of neurophysiological stress potential informed by
        published research.
      </p>

      <a
        class="ns-hero-research"
        href="https://cleovalentine.io/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Based on research by Dr. Cleo Valentine · Architectural Neuroimmunology
      </a>

      <p class="ns-hero-byline">
        By
        <a
          class="ns-hero-author"
          href="https://www.linkedin.com/in/emilieelchidiac/"
          target="_blank"
          rel="noopener noreferrer"
        >Emilie El Chidiac</a>
      </p>

      <button class="ns-cta-btn" @click="$emit('enterLab')">
        Enter the Lab
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7l6 6 6-6" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="ns-hero-stats">
        <div class="ns-stat">
          <span class="ns-stat-number">7</span>
          <span class="ns-stat-label">Spatial Parameters</span>
        </div>
        <div class="ns-stat">
          <span class="ns-stat-number">5</span>
          <span class="ns-stat-label">Neuro Dimensions</span>
        </div>
        <div class="ns-stat">
          <span class="ns-stat-number">0–100</span>
          <span class="ns-stat-label">NeuroScore Range</span>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup>
defineEmits(['enterLab'])
</script>
