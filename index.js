const crypto = require('crypto')
const XorShift = require('xorshift').constructor
const { createServer } = require('http')
const fs = require('fs')
const jwt = require('jsonwebtoken')

const FINAL_COORDS = fs.readFileSync('./final-coords.txt').toString('utf-8')

const getPersistedState = () => {
  try {
    return JSON.parse(fs.readFileSync('state.json'))
  } catch (err) {
    const data = {
      seeds: [
        crypto.randomInt(0, 0xffffffff),
        crypto.randomInt(0, 0xffffffff),
        crypto.randomInt(0, 0xffffffff),
        crypto.randomInt(0, 0xffffffff),
      ],
      jwtSecret: crypto.randomBytes(256).toString('base64'),
    }

    fs.writeFileSync('state.json', JSON.stringify(data))

    return data
  }
}

const persistedState = getPersistedState()

const NOTES = [
  'C#5',
  'D#5',
  'F#5',
  'G#5',
  'A#5',
  'C4',
  'C#4',
  'D4',
  'D#4',
  'E4',
  'F4',
  'F#4',
  'G4',
  'G#4',
  'A4',
  'A#4',
  'B4',
  'C5',
  'D5',
  'E5',
  'F5',
  'G5',
  'A5',
  'B5',
  'C6',
]

const getRequestBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk.toString()
    })

    req.on('end', () => {
      resolve(data)
    })
  })

const noteToNumber = (note) => {
  return NOTES.indexOf(note)
}

const getTuningForSeed = (note, seed) => {
  const noteNumber = noteToNumber(note)
  if (noteNumber < 0) throw new Error('invalid note')
  const rng = new XorShift([
    seed + persistedState.seeds[0],
    seed + persistedState.seeds[1],
    noteNumber + persistedState.seeds[2],
    noteNumber + persistedState.seeds[3],
  ])

  for (let i = 200; i--; ) rng.random()

  return Math.floor(rng.random() * 21)
}

const checkTimes = {}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400
    res.end('just tune the piano :)')
    return
  }

  if (req.url === '/viritys/') {
    res.setHeader('Content-type', 'text/html')
    fs.createReadStream('./index.html').pipe(res)
    return
  }

  if (req.url === '/viritys/cartographer.png') {
    res.setHeader('Content-type', 'image/png')
    fs.createReadStream('./cartographer.png').pipe(res)
    return
  }

  if (req.url === '/viritys/token') {
    res.end(
      jwt.sign(
        {
          seed: crypto.randomInt(0, 0xffffffff),
        },
        persistedState.jwtSecret
      )
    )
    return
  }

  if (req.url === '/viritys/verify') {
    try {
      jwt.verify(req.headers.authorization, persistedState.jwtSecret)
      res.end('ok')
    } catch (err) {
      res.end('nope')
    }
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.statusCode = 400
    res.end('just tune the piano :)')
    return
  }

  let token
  try {
    token = jwt.verify(authHeader, persistedState.jwtSecret)
  } catch (err) {
    res.statusCode = 400
    res.end('just tune the piano :)')
    return
  }

  if (req.url === '/viritys/check') {
    let tuningMap

    try {
      tuningMap = JSON.parse(await getRequestBody(req))
    } catch (err) {
      res.statusCode = 400
      res.end('just tune the piano :)')
      return
    }

    const now = Date.now() / 1000
    const lastCheck = checkTimes[token.seed] ?? 0

    if (now - lastCheck < 60) {
      res.end(
        JSON.stringify({
          tuned: false,
          message:
            'Tarkistit viimeksi alle minuutti sitten, palaappa vielä hetkeksi sorvin ääreen.',
        })
      )
      return
    }

    checkTimes[token.seed] = now

    const distances = NOTES.map((note) => {
      const tuning = tuningMap[note]
      if (typeof tuning === 'undefined') {
        return Infinity
      }

      const tuningNumber = getTuningForSeed(note, token.seed)
      const originalTuning = tuningNumber * 5 - 50

      return Math.round(Math.abs(originalTuning + tuning))
    })

    const acceptableTunings = distances.filter(
      (distance) => distance <= 8
    ).length

    console.log(
      `[${token.seed}]: Count ${acceptableTunings}, tunings ${JSON.stringify(
        distances
      )}`
    )

    let message
    let tuned = false

    if (acceptableTunings == 25) {
      tuned = true
      message = FINAL_COORDS
    } else if (acceptableTunings > 23) {
      message = `<h3>Ei ihan vielä täydellinen, mutta...</h3>
        <p>Enää muutama nuotti kaipaa viimeiset hienosäädöt. Mahtavaa työtä, vielä loppurutistus ja saadaan tämä työ päätökseen.</p>`
    } else if (acceptableTunings > 20) {
      message = `<h3>Hienosäädön varaa vielä on, mutta...</h3>
      <p>Loppusuora häämöttää! Tällähän voi jo soittaa jotain. Ei silti varmaan kelpaisi virittäjän asiakkaalle palautettavaksi.</p>`
    } else if (acceptableTunings > 15) {
      message = `<h3>Eipä näillä eväillä vielä naatteja saa, mutta...</h3>
        <p>Hei! Täällähän on tapahtunut edistystä! Paljon on silti vielä hommaa jäljellä.</p>`
    } else if (acceptableTunings > 10) {
      message = `<h3>Nuotit särähtävät vielä pahoin korvaan, mutta...</h3>
        <p>Muutama kosketin kuulostaa jo aivan oikealta, mutta ei tällä vielä kehtaa soittaa muuta kuin Ukko-Nooaa...</p>`
    } else if (acceptableTunings > 5) {
      message = `<h3>Ei, ei, ei...</h3>
        <p>Tämä piano vaikuttaa olevan vielä pahasti epävireessä... Jatka virittämistä!</p>`
    } else {
      message = `<h3>😡</h3>
        <p>Teitkö sinä edes mitään tälle, vai laitoitko nupit kaakkoon ihan omiasi? Tämähän on aivan täydellisesti epävireessä!</p>`
    }

    res.end(
      JSON.stringify({
        tuned,
        message,
      })
    )
    return
  }

  const match = decodeURIComponent(req.url).match(
    /^\/viritys\/piano\?note=([A-G]#?[456])$/
  )

  if (!match) {
    res.statusCode = 400
    res.end('just tune the piano :)')
    return
  }

  const [, note] = match

  if (!NOTES.includes(note)) {
    res.statusCode = 400
    res.end('just tune the piano :)')
    return
  }

  const tuning = getTuningForSeed(note, parseInt(token.seed))
  const file = `./notes/${note}-${tuning}.mp3`

  res.setHeader('Content-type', 'audio/mp3')
  fs.createReadStream(file).pipe(res)
})

server.listen(3093)
