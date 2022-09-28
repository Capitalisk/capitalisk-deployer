const util = require('util');
const exec = util.promisify(require('child_process').exec);
const commandExists = require('command-exists').sync;
const os = require('os');
const { readFile, writeFile } = require('fs/promises');

const DEFAULT_REPOSITORY_URL =
  'https://github.com/Capitalisk/capitalisk-core.git';
const DEFAULT_DIR_NAME = 'capitalisk-core';
const DEFAULT_NETWORK_SYMBOL = 'clsk';
const JSON_INDENTATION = 2;

class CustomError extends Error {
  constructor(message, name) {
    super(message);
    this.name = name;
  }
}

class CapitaliskDeployer {
  #deployed;

  constructor({
    gitUrl = DEFAULT_REPOSITORY_URL,
    dirName = DEFAULT_DIR_NAME,
    networkSymbol = DEFAULT_NETWORK_SYMBOL,
    path = process.cwd(),
  }) {
    this.gitUrl = gitUrl;
    this.dirName = dirName;
    this.networkSymbol = networkSymbol;
    this.path = path;
    this.#deployed = false;

    if (os.platform().indexOf('win') > -1) {
      throw new CustomError('Not supported for Windows, yet.', 'WindowsError');
    }

    if (!commandExists('git')) {
      throw new CustomError(
        'You need to install git for this to work. Run sudo apt install git',
        'GitNotInstalled',
      );
    }

    if (!commandExists('docker-compose')) {
      throw new CustomError(
        'You need to install docker-compose for this to work.\nSee how on https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository.',
        'DockerNotInstalled',
      );
    }

    this.#verifyDeployment();
  }

  async #verifyDeployment() {
    const { stdout } = await exec('docker ps');
    this.#deployed = !!stdout.match(/capitalisk-core/);
  }

  async deploy() {
    console.log(`Cloning ${this.gitUrl} as ${this.dirName}`);
    await exec(`git clone ${this.gitUrl} ${this.dirName}`, {
      cwd: `${this.path}`,
    });

    console.log(`Build docker`);
    await exec(`docker-compose build --no-cache`, {
      cwd: `${this.path}/${this.dirName}`,
    });

    console.log(`Spin up container`);
    await exec(`docker-compose up -d`, {
      cwd: `${this.path}/${this.dirName}`,
    });

    this.#deployed = true;
  }

  async undeploy() {
    if (!this.#deployed) {
      throw new CustomError(
        'Unable to run undeploy. No container is deployed!',
        'NoDeployFound',
      );
    }

    console.log(`Shutting down container`);
    try {
      await exec(`docker-compose down`, {
        cwd: `${this.path}/${this.dirName}`,
      });
    } catch (e) {
      throw new CustomError(`Container not found`, 'ContainerNotFound');
    }

    this.#deployed = false;
  }

  async updateDeploy() {
    console.log(`Recreating docker containers`);
    await exec(`docker-compose up -d --force-recreate`);
  }

  async createGenesis(genesis) {
    try {
      const g = await this.#readJSONFile(
        `${this.path}/${this.dirName}/genesis/mainnet/${this.networkSymbol}-genesis.json`,
      );

      if (g && g.networkSymbol === this.networkSymbol) {
        console.log('Genesis is already present');
      }
    } catch (e) {}

    try {
      await this.#writeJSONFile(
        `${this.path}/${this.dirName}/genesis/mainnet/${this.networkSymbol}-genesis.json`,
        genesis,
      );
    } catch (e) {
      throw new CustomError(
        `Error writing genesis file! ${e.message}`,
        'GenesisWriteFail',
      );
    }
  }

  async writeConfig(config, extendCapitalisk) {
    console.log(`Adding config`);
    const c = await this.#readJSONFile(
      `${this.path}/${this.dirName}/config.json`,
    );

    // Removing
    if (!extendCapitalisk && c.modules['capitalisk_chain']) {
      console.log('Removing capitalisk_chain entry')
      delete c.modules['capitalisk_chain'];
    }

    console.log(`Adding database inside postgresql container`);
    try {
      await exec(
        `docker exec capitalisk-postgres runuser -l postgres -c "createdb -U ldpos ${config.components.dal.connection.database}"`,
      );
    } catch (e) {
      if (e.message.match(/exists/g)) {
        console.log('Recreating the database');
        await exec(
          `docker exec capitalisk-postgres runuser -l postgres -c "dropdb -U ldpos ${config.components.dal.connection.database}"`,
        );
        await exec(
          `docker exec capitalisk-postgres runuser -l postgres -c "createdb -U ldpos ${config.components.dal.connection.database}"`,
        );
      } else {
        throw new CustomError(
          `Failed to create the database in the docker container! ${e.message}`,
          'PostgresInitFail',
        );
      }
    }

    c.modules[`${this.dirName.split('-')[0]}_chain`] = config;

    await this.#writeJSONFile(`${this.path}/${this.dirName}/config.json`, c);

    console.log(c);
  }

  async #readJSONFile(filePath) {
    let content = await readFile(filePath, { encoding: 'utf8' });
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to parse the JSON content of file at path ${filePath} because of error: ${error.message}`,
      );
    }
  }

  async #writeJSONFile(filePath, object) {
    let jsonString = JSON.stringify(object, null, JSON_INDENTATION);
    return writeFile(filePath, jsonString, { encoding: 'utf8' });
  }
}

module.exports = CapitaliskDeployer;
