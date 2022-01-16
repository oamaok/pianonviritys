const cp = require('child_process')
const fs = require('fs')

const main = async () => {
  const dir = fs.readdirSync('.')

  for (const entry of dir) {
    if (!entry.endsWith('.wav')) continue

    const note = entry.split('.')[0]

    for (let i = 0; i <= 20; i++) {
      const rate = 2 ** ((i * 5 - 50 - 12) / 1200)

      cp.spawn('ffmpeg', [
        '-y',
        '-i',
        entry,
        '-af',
        `asetrate=${rate.toFixed(6)}*44.1k,aresample=44100`,
        `tuned/${note}-${i}.mp3`,
      ])
    }
  }
}
main()
