export async function loadTextFile(path: string) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load "${path}"`)
  }
  const text = await response.text()
  return text
}

/**
 * Compila uno shader (vertex o fragment) per la GPU
 * @param gl - contesto WebGL
 * @param type - gl.VERTEX_SHADER o gl.FRAGMENT_SHADER
 * @param src - codice sorgente GLSL dello shader
 */
function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  // Crea un nuovo oggetto shader vuoto nella GPU
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Unable to create shader')
  }

  // Carica il codice sorgente GLSL nello shader
  gl.shaderSource(shader, src)

  // Compila il codice GLSL in bytecode eseguibile dalla GPU
  gl.compileShader(shader)

  // Verifica se la compilazione è avvenuta con successo
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }
  return shader
}

/**
 * Crea un WebGL program completo da un vertex shader e un fragment shader
 * Un program è l'unità eseguibile finale che la GPU userà per disegnare
 */
function createProgramFromFragment(
  gl: WebGLRenderingContext,
  fragmentSource: string,
  vertexSource: string
): WebGLProgram {
  // Compila il fragment shader (determina il colore di ogni pixel)
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  // Compila il vertex shader (trasforma le posizioni dei vertici)
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)

  // Crea un nuovo program vuoto
  const program = gl.createProgram()
  if (!program) {
    throw new Error('Unable to create program')
  }

  // Collega gli shader compilati al program
  gl.attachShader(program, fragShader)
  gl.attachShader(program, vertexShader)

  // Link: collega input e output tra vertex e fragment shader
  // e prepara il program per l'esecuzione sulla GPU
  gl.linkProgram(program)

  // Verifica che il linking sia avvenuto con successo
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${info}`)
  }
  return program
}

/**
 * Ridimensiona il canvas e il viewport WebGL per adattarsi allo schermo
 * Gestisce il devicePixelRatio per display ad alta densità (retina, 4K, etc)
 */
function resize(gl: WebGLRenderingContext, canvas: HTMLCanvasElement) {
  // Ottiene il pixel ratio del dispositivo (es. 2 per retina display)
  const dpr = window.devicePixelRatio || 1

  // Calcola le dimensioni fisiche del canvas in pixel del dispositivo
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr))
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr))

  // Ridimensiona il canvas solo se necessario (evita flickering)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height

    // Imposta il viewport WebGL: definisce la regione del canvas dove disegnare
    // (0, 0) è l'angolo in basso a sinistra
    gl.viewport(0, 0, width, height)
  }
}

/**
 * Loop di rendering: esegue il disegno di ogni frame
 * Viene chiamata continuamente tramite requestAnimationFrame
 */
function render(
  gl: WebGLRenderingContext,
  start: number,
  now: number,
  uTime: WebGLUniformLocation | null
) {
  // Calcola il tempo trascorso dall'inizio in secondi
  const time = (now - start) / 1000

  // Imposta il colore di sfondo (nero: RGBA = 0, 0, 0, 1)
  gl.clearColor(0, 0, 0, 1)

  // Pulisce il buffer dei colori riempiendolo con il colore impostato sopra
  gl.clear(gl.COLOR_BUFFER_BIT)

  // Passa il tempo corrente come uniform al fragment shader
  // Le uniform sono variabili globali accessibili dagli shader
  if (uTime) {
    gl.uniform1f(uTime, time)
  }

  // Disegna i triangoli: interpreta i 6 vertici come 2 triangoli
  // (ogni triangolo usa 3 vertici, quindi 2 triangoli = 6 vertici)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // Richiede il prossimo frame di animazione
  requestAnimationFrame((time) => render(gl, start, time, uTime))
}

/**
 * Inizializza WebGL e prepara tutto il necessario per il rendering
 */
async function init() {
  // Ottiene il canvas HTML dove disegneremo con WebGL
  const canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement

  // Ottiene il contesto WebGL: l'interfaccia per comunicare con la GPU
  const gl = canvas.getContext('webgl')
  if (!gl) {
    throw new Error('WebGL not supported')
  }

  // Ridimensiona il canvas alle dimensioni corrette
  resize(gl, canvas)

  // Registra un listener per ridimensionare quando la finestra cambia dimensioni
  window.addEventListener('resize', () => resize(gl, canvas))

  const fragmentShaderPath = new URL(
    './shaders/hello-world.frag',
    import.meta.url
  ).href
  const vertexShaderPath = new URL(
    './shaders/passthrough.vert',
    import.meta.url
  ).href

  let fragmentShaderSource = ''
  let vertexShaderSource = ''

  try {
    fragmentShaderSource = await loadTextFile(fragmentShaderPath)
    vertexShaderSource = await loadTextFile(vertexShaderPath)
  } catch (error) {
    throw new Error(`Error loading shaders: ${error}`)
  }

  // Crea il program WebGL linkando i due shader
  const program = createProgramFromFragment(
    gl,
    fragmentShaderSource,
    vertexShaderSource
  )

  // Attiva il program: tutti i successivi comandi WebGL useranno questo program
  gl.useProgram(program)

  // Definisce le posizioni dei vertici in clip space (coordinate normalizzate -1 a 1)
  // 6 vertici = 2 triangoli che formano un rettangolo che copre l'intero schermo
  // Formato: [x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6]
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])

  // Crea un buffer nella memoria della GPU per contenere i dati dei vertici
  const positionBuffer = gl.createBuffer()

  // Lega il buffer al binding point ARRAY_BUFFER (dove WebGL si aspetta i dati dei vertici)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)

  // Carica i dati delle posizioni nel buffer sulla GPU
  // STATIC_DRAW indica che i dati non cambieranno (ottimizzazione)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

  // Ottiene la location dell'attributo 'a_position' definito nel vertex shader
  const aPos = gl.getAttribLocation(program, 'a_position')

  if (aPos >= 0) {
    // Abilita l'attributo per ricevere dati dal buffer
    gl.enableVertexAttribArray(aPos)

    // Specifica come interpretare i dati del buffer per questo attributo:
    // - aPos: l'indice dell'attributo
    // - 2: ogni vertice ha 2 componenti (x, y)
    // - gl.FLOAT: i dati sono float a 32 bit
    // - false: non normalizzare i valori
    // - 0: stride (0 = dati packed senza padding)
    // - 0: offset (inizia dal byte 0 del buffer)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  }

  // Ottiene la location della uniform 'u_time' nel fragment shader
  // Le uniform sono variabili globali che rimangono costanti per tutti i vertici/pixel di un draw call
  const uTime = gl.getUniformLocation(program, 'u_time')

  // Salva il timestamp di inizio per calcolare il tempo trascorso
  let start = performance.now()

  // Avvia il loop di rendering
  render(gl, start, start, uTime)
}

init()
