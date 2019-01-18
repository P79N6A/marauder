'use strict'

const fs = require('fs')
const md5 = require('md5')
const Vinyl = require('vinyl')
const chalk = require('chalk')
const axios = require('axios')
const path = require('path')
const execa = require('execa')
const config = require('../../config')
const { uploadVinylFile } = require('../ftp')
const { rootPath } = require('../utils')
const CONF_DIR = '/wap_front/hybrid/config/'
const CONF_NAME = getHbConfName(config.ciConfig)
const CONF_URL = `http://wap_front.dev.sina.cn/hybrid/config/${CONF_NAME}`

const publishStep = [
  `${chalk.blue('🐝  [1/4]')} Fetching config...`,
  // ✏️ 后面需要多补充一个空格
  `${chalk.blue('✏️   [2/4]')} Updating config...`,
  `${chalk.blue('🚀  [3/4]')} Pushing config...`,
  `${chalk.blue('🎉  [4/4]')} ${chalk.green('Success')}\n`
]

function getHbConfName(ciConfig) {
  const confName = ciConfig.zip_config_name || 'sina_news'

  return `${confName}.json`
}

async function updateRemoteHbConf(hbConf) {
  // 创建虚拟文件
  const confFile = new Vinyl({
    path: rootPath(CONF_NAME),
    contents: Buffer.from(JSON.stringify(hbConf))
  })

  try {
    await uploadVinylFile(confFile, CONF_DIR)
  } catch (e) {
    console.log('Hybrid config 上传失败')
    throw new Error(e)
  }
}

async function getGitRepoName() {
  try {
    const { stdout: remoteUrl } = await execa('git', [
      'config',
      '--get',
      'remote.origin.url'
    ])

    return path.basename(remoteUrl, '.git')
  } catch (e) {
    error(e)
  }

  function error(e) {
    console.log('获取git工程名失败，请检查是否设置远程git仓库')
    throw new Error(e)
  }
}

async function getHbConf(confPath) {
  try {
    const hbConf = await axios(confPath)
    const initConf = {
      status: 0,
      reqTime: Date.now(),
      data: {
        modules: []
      }
    }

    return hbConf.data || initConf
  } catch (e) {
    console.log(`请检查网络或联系管理员`)
    throw new Error(e)
  }
}

function logResult(hbMod) {
  console.log(hbMod)
  console.log(`\n${chalk.bgYellow(' CONF ')} ${chalk.yellow(CONF_URL)}\n`)
}

module.exports = async function(entry, remotePath) {
  console.log('----------- Hybrid Publish Dev -----------\n')
  console.log(publishStep[0])

  const hbConf = await getHbConf(CONF_URL)
  const repoName = await getGitRepoName()
  const moduleName = `${repoName}/${entry}`
  const localPkgPath = rootPath(`dist/${entry}/${entry}.php`)
  const moduleIdx = hbConf.data.modules.findIndex(
    item => item.name === moduleName
  )
  let gkList = []
  let qeList = []

  try {
    const manifest = require(rootPath(`src/view/${entry}/public/manifest.json`))

    gkList = manifest.display.gkTestIds || []
    qeList = manifest.display.qeTestIds || []
  } catch (e) {}

  const hbMod = {
    name: moduleName,
    version: process.env.npm_package_version,
    pkg_url: `${remotePath + entry}.php`,
    hybrid: true,
    md5: md5(fs.readFileSync(localPkgPath)),
    gkList,
    qeList
  }

  console.log(publishStep[1])
  if (moduleIdx > -1) {
    hbConf.data.modules[moduleIdx] = hbMod
  } else {
    hbConf.data.modules.push(hbMod)
  }

  console.log(publishStep[2])
  await updateRemoteHbConf(hbConf)
  console.log(publishStep[3])

  logResult(hbMod)
}
