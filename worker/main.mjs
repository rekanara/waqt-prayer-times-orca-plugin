// FVM Manager worker. Runs in Orca's separate Node process (trusted-worker).
// The panel never builds a command line: it asks for an action by name and
// this worker turns it into a fixed fvm argument list, run without a shell.
import { spawn } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const IS_WIN = process.platform === 'win32'
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._@+/-]{0,99}$/
const CHANNELS = new Set(['stable', 'beta', 'dev'])
const ACTIONS = new Set(['use', 'install', 'remove', 'global'])
const MAX_LOG_LINES = 300

function fail(code, message) {
  return Object.assign(new Error(message), { code })
}

// Orca hands workers its launch PATH. Apps opened from the Dock often miss the
// places fvm usually lives, so add them after whatever is already there.
function buildEnv() {
  const home = homedir()
  const extra = IS_WIN
    ? [
        path.join(process.env.LOCALAPPDATA ?? '', 'Pub', 'Cache', 'bin'),
        path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'chocolatey', 'bin'),
        path.join(home, 'fvm', 'bin')
      ]
    : [
        path.join(home, '.pub-cache', 'bin'),
        path.join(home, 'fvm', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/home/linuxbrew/.linuxbrew/bin'
      ]
  const current = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  const merged = [...current, ...extra.filter((p) => p && !current.includes(p))]
  return { ...process.env, PATH: merged.join(path.delimiter), NO_COLOR: '1', TERM: 'dumb' }
}

const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g
const clean = (s) => s.replace(ANSI_RE, '').replace(/\r/g, '')

export default function activate(orca) {
  const env = buildEnv()
  const jobs = new Map()
  let jobCounter = 0
  let activeJob = null

  async function readSettings() {
    try {
      const { settings } = await orca.host.call('settings.get', {})
      return settings ?? {}
    } catch {
      return {}
    }
  }

  async function fvmCommand() {
    const { fvmPath } = await readSettings()
    return typeof fvmPath === 'string' && fvmPath.trim() ? fvmPath.trim() : 'fvm'
  }

  // Every argument is either a fixed literal or a value checked against
  // VERSION_RE, so the cmd.exe route on Windows has nothing to interpret.
  async function spawnFvm(args, { cwd, signal, onLine, timeoutMs = 60_000 } = {}) {
    const bin = await fvmCommand()
    let file = bin
    let argv = args
    let opts = { cwd: cwd ?? homedir(), env, windowsHide: true, signal }
    if (IS_WIN && !/\.exe$/i.test(bin)) {
      // fvm from `dart pub global activate` is a .bat, which needs cmd.exe.
      file = process.env.ComSpec ?? 'cmd.exe'
      argv = ['/d', '/s', '/c', `"${[bin, ...args].map((a) => `"${a}"`).join(' ')}"`]
      opts.windowsVerbatimArguments = true
    }
    return new Promise((resolve, reject) => {
      let child
      try {
        child = spawn(file, argv, opts)
      } catch (error) {
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      let pending = ''
      const timer = setTimeout(() => child.kill(), timeoutMs)
      const feed = (chunk, isErr) => {
        const text = clean(chunk.toString())
        if (isErr) stderr += text
        else stdout += text
        if (!onLine) return
        pending += text
        const lines = pending.split('\n')
        pending = lines.pop()
        for (const line of lines) if (line.trim()) onLine(line)
      }
      child.stdout.on('data', (c) => feed(c, false))
      child.stderr.on('data', (c) => feed(c, true))
      child.on('error', (error) => {
        clearTimeout(timer)
        if (error.code === 'ENOENT') {
          reject(fail('unavailable', `Can't find fvm (looked for "${bin}"). Install FVM or set its path in the plugin settings.`))
        } else reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (onLine && pending.trim()) onLine(pending)
        resolve({ code, stdout, stderr })
      })
    })
  }

  async function fvmJson(args, cwd) {
    const { code, stdout, stderr } = await spawnFvm(['api', ...args, '--compress'], { cwd })
    // Update notices can precede the JSON, so start at the first brace.
    const start = stdout.indexOf('{')
    if (code !== 0 || start < 0) {
      throw fail('action_failed', (stderr || stdout).trim().split('\n').slice(-3).join(' ') || `fvm api ${args[0]} failed`)
    }
    return JSON.parse(stdout.slice(start))
  }

  async function focusedWorkspace() {
    const ctx = await orca.host.call('workspace.readContext', {})
    if (!ctx) return null
    const { workspaces } = await orca.host.call('workspace.list', {})
    const row =
      workspaces.find((w) => ctx.workspaceId && w.id === ctx.workspaceId) ??
      workspaces.find((w) => w.name === ctx.displayName && w.branch === ctx.branch)
    if (!row) return { name: ctx.displayName, branch: ctx.branch, path: null, remote: false }
    const remote = row.hostId != null && row.hostId !== 'local'
    return { name: row.name, branch: row.branch, path: row.path, remote }
  }

  async function globalVersion(context) {
    const link = context?.globalCacheLink
    const root = context?.versionsCachePath
    if (!link || !root) return null
    try {
      const target = await realpath(link)
      const rel = path.relative(await realpath(root), target)
      return rel && !rel.startsWith('..') ? rel.split(path.sep).join('/') : path.basename(target)
    } catch {
      return null // no global SDK set
    }
  }

  function jobView(job) {
    const { id, action, version, state, exitCode, startedAt, endedAt, log } = job
    return { id, action, version, state, exitCode, startedAt, endedAt, log: log.slice(-80) }
  }

  orca.panels.handle('fvm.status', async () => {
    const workspace = await focusedWorkspace().catch(() => null)
    const local = workspace?.path && !workspace.remote ? workspace.path : null
    const [context, list, project] = await Promise.allSettled([
      fvmJson(['context']),
      fvmJson(['list', '--skip-size-calculation']),
      local ? fvmJson(['project', '--path', local], local) : Promise.resolve(null)
    ])
    if (context.status === 'rejected') {
      return { ok: false, error: context.reason.message, workspace }
    }
    const ctx = context.value.context ?? {}
    const proj = project.status === 'fulfilled' ? project.value?.project ?? null : null
    return {
      ok: true,
      fvmVersion: ctx.fvmVersion ?? null,
      globalVersion: await globalVersion(ctx),
      workspace,
      project: proj && {
        name: proj.name,
        hasConfig: proj.hasConfig,
        isFlutter: proj.isFlutter,
        pinned: proj.pinnedVersion?.name ?? null,
        activeFlavor: proj.activeFlavor ?? null,
        flavors: proj.flavors ?? {}
      },
      installed: list.status === 'fulfilled'
        ? (list.value.versions ?? []).map((v) => ({
            name: v.name,
            type: v.type,
            channel: v.releaseFromChannel ?? null,
            flutter: v.flutterSdkVersion ?? null,
            dart: v.dartSdkVersion ?? null,
            isSetup: v.isSetup !== false
          }))
        : [],
      unused: list.status === 'fulfilled' ? list.value.unreferencedVersions ?? [] : [],
      activeJob: activeJob ? jobView(activeJob) : null
    }
  })

  orca.panels.handle('fvm.releases', async ({ channel = 'stable', limit = 30 } = {}) => {
    if (!CHANNELS.has(channel)) throw fail('invalid_params', 'channel must be stable, beta or dev')
    const n = Math.max(1, Math.min(100, Number(limit) || 30))
    const data = await fvmJson(['releases', '--limit', String(n), '--filter-channel', channel])
    return (data.versions ?? []).map((r) => ({
      version: r.version,
      channel: r.channel,
      date: r.release_date,
      dart: (r.dart_sdk_version ?? '').split(' ')[0] || null
    }))
  })

  orca.panels.handle('fvm.run', async ({ action, version } = {}) => {
    if (!ACTIONS.has(action)) throw fail('invalid_params', `Unknown action "${action}"`)
    if (typeof version !== 'string' || !VERSION_RE.test(version)) {
      throw fail('invalid_params', 'That is not a valid FVM version name.')
    }
    if (activeJob) throw fail('conflict', `fvm ${activeJob.action} ${activeJob.version} is still running.`)

    let cwd
    if (action === 'use') {
      const ws = await focusedWorkspace()
      if (!ws?.path) throw fail('invalid_params', 'Focus a workspace in Orca first.')
      if (ws.remote) throw fail('invalid_params', 'This workspace is on a remote host; FVM Manager only runs fvm on this computer.')
      cwd = ws.path
    }
    const args = [action, version]
    if (action === 'use') {
      const { skipPubGet } = await readSettings()
      if (skipPubGet) args.push('--skip-pub-get')
    }
    args.push('--fvm-skip-input')

    const job = {
      id: `job-${++jobCounter}`,
      action,
      version,
      state: 'running',
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
      log: [`$ fvm ${args.join(' ')}`]
    }
    jobs.set(job.id, job)
    activeJob = job

    // Batch output so a chatty install stays well inside Orca's post budget.
    let buffered = []
    const flush = () => {
      if (!buffered.length) return
      orca.panels.post('fvm.job.output', { id: job.id, lines: buffered })
      buffered = []
    }
    const ticker = setInterval(flush, 500)
    const onLine = (line) => {
      job.log.push(line)
      if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
      buffered.push(line)
    }

    orca.panels.post('fvm.job.started', jobView(job))
    spawnFvm(args, { cwd, onLine, timeoutMs: 45 * 60_000 })
      .then(({ code }) => {
        job.exitCode = code
        job.state = code === 0 ? 'done' : 'failed'
      })
      .catch((error) => {
        onLine(error.message)
        job.state = 'failed'
      })
      .finally(async () => {
        clearInterval(ticker)
        flush()
        job.endedAt = Date.now()
        activeJob = null
        orca.panels.post('fvm.job.finished', jobView(job))
        orca.log(`fvm ${action} ${version}: ${job.state}`)
        try {
          await orca.host.call('notifications.show', {
            title: job.state === 'done' ? `fvm ${action} ${version} finished` : `fvm ${action} ${version} failed`,
            body: job.log[job.log.length - 1] ?? ''
          })
        } catch {}
      })

    return { jobId: job.id }
  })

  orca.panels.handle('fvm.job', async ({ id } = {}) => {
    const job = jobs.get(id)
    if (!job) throw fail('invalid_params', 'No such job')
    return jobView(job)
  })
}
