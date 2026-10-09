// Sound notification utility using Web Audio API (100% offline, zero network assets)
export function isSoundEnabled() {
  if (typeof window === 'undefined') return false
  const val = localStorage.getItem('monitoring_sound_enabled')
  return val === null ? false : val === 'true' // default off until user opts in
}

export function setSoundEnabled(enabled) {
  if (typeof window === 'undefined') return
  localStorage.setItem('monitoring_sound_enabled', enabled ? 'true' : 'false')
}

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Plays a pleasant alert chime
export function playAlertSound(type = 'warning') {
  if (!isSoundEnabled()) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'critical') {
      // Urgent dual-tone chime (high-low-high)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now) // A5
      osc.frequency.setValueAtTime(587.33, now + 0.15) // D5
      osc.frequency.setValueAtTime(880, now + 0.3) // A5

      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6)

      osc.start(now)
      osc.stop(now + 0.6)
    } else if (type === 'recovery') {
      // Pleasant rising major third (all clear)
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12) // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24) // G5

      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)

      osc.start(now)
      osc.stop(now + 0.5)
    } else {
      // Subtle warning ping
      osc.type = 'sine'
      osc.frequency.setValueAtTime(700, now)
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3)

      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)

      osc.start(now)
      osc.stop(now + 0.35)
    }
  } catch (e) {
    console.warn('Web Audio alert failed:', e)
  }
}
