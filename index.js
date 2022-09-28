const util = require('util');
const exec = util.promisify(require('child_process').exec);
const commandExists = require('command-exists').sync;
const os = require('os');
const { readFile, writeFile, readdir } = require('fs/promises');

const DEFAULT_REPOSITORY_URL =
  'https://github.com/Capitalisk/capitalisk-core.git';
const DEFAULT_PROJECT_NAME = 'capitalisk';
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
    projectName = DEFAULT_PROJECT_NAME,
    networkSymbol = DEFAULT_NETWORK_SYMBOL,
    path = process.cwd(),
  }) {
    this.gitUrl = gitUrl;
    this.projectName = projectName;
    this.dirName = this.projectName + '-core';
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
    this.getConfig();
  }

  async #verifyDeployment() {
    const { stdout } = await exec('docker ps');
    this.#deployed = !!stdout.match(/capitalisk-core/);
  }

  async projectDirectoryCloned() {
    try {
      await readdir(`${this.path}/${this.dirName}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  async clone() {
    if (await this.projectDirectoryCloned()) return;

    console.log(`Cloning ${this.gitUrl} as ${this.dirName}`);
    await exec(`git clone ${this.gitUrl} ${this.dirName}`, {
      cwd: `${this.path}`,
    });

    if (DEFAULT_PROJECT_NAME !== this.projectName) {
      console.log('Renaming docker-compose container names');
      const dc = await readFile(
        `${this.path}/${this.dirName}/docker-compose.yml`,
        { encoding: 'utf8' },
      );

      const newDc = dc.replaceAll(DEFAULT_PROJECT_NAME, this.projectName);

      await writeFile(
        `${this.path}/${this.dirName}/docker-compose.yml`,
        newDc,
        {
          encoding: 'utf8',
        },
      );
    }
  }

  async deploy() {
    await this.clone();

    console.log(`Build docker`);
    await exec(`docker-compose build --no-cache`, {
      cwd: `${this.path}/${this.dirName}`,
    });

    console.log(`Spin up container`);
    await exec(`docker-compose up -d`, {
      cwd: `${this.path}/${this.dirName}`,
    });

    this.createDatabase(this.config.base.components.dal.connection.database);

    for (const key in this.config.modules) {
      const m = this.config.modules[key];
      if (m.components && m.components.dal) {
        this.createDatabase(m.components.dal.connection.database);
      }
    }

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
    await exec(`docker-compose up -d --force-recreate`, {
      cwd: `${this.path}/${this.dirName}`,
    });
  }

  async createGenesis(genesis, networkSymbol = this.networkSymbol) {
    await this.clone();

    console.log(`Creating ${networkSymbol} genesis`);

    try {
      const g = await this.#readJSONFile(
        `${this.path}/${this.dirName}/genesis/mainnet/${networkSymbol}-genesis.json`,
      );

      if (g && g.networkSymbol === networkSymbol) {
        console.log('Genesis is already present');
      }
    } catch (e) {}

    try {
      await this.#writeJSONFile(
        `${this.path}/${this.dirName}/genesis/mainnet/${networkSymbol}-genesis.json`,
        genesis,
      );
    } catch (e) {
      throw new CustomError(
        `Error writing genesis file! ${e.message}`,
        'GenesisWriteFail',
      );
    }
  }

  async getConfig() {
    const c = await this.#readJSONFile(
      `${this.path}/${this.dirName}/config.json`,
    );

    this.config = c;

    return c;
  }

  async writeConfig(
    config,
    {
      // extend = false,
      projectName = this.projectName,
    },
  ) {
    await this.clone();

    if (!config) throw new Error('Need a config to proceed!');

    console.log(`Adding config`);
    const c = await this.getConfig();

    // TODO: Remove all entries, create custom blockchain
    // if (!extend && c.modules['capitalisk_chain']) {
    //   console.log('Removing capitalisk_chain entry');
    //   delete c.modules['capitalisk_chain'];
    // }

    c.modules[`${projectName}_chain`] = config;

    await this.#writeJSONFile(`${this.path}/${this.dirName}/config.json`, c);
  }

  async createDatabase(db) {
    // TODO: Fix this
    // const { stdout } = await exec(
    //   `docker exec ${this.projectName}-postgres runuser -l postgres -c "psql -U ldpos --list"`,
    // );
    // if (stdout.match(db)) {
    //   console.log(`Database ${db} already exists, skipping.`);
    // }

    console.log(`Creating ${db} database inside postgresql container`);
    try {
      await exec(
        `docker exec ${this.projectName}-postgres runuser -l postgres -c "createdb -U ldpos ${db}"`,
      );
    } catch (e) {
      if (e.message.match(/exists/g)) {
        console.log(`Recreating ${db}`);
        await exec(
          `docker exec ${this.projectName}-postgres runuser -l postgres -c "dropdb -U ldpos ${db}"`,
        );
        await this.createDatabase(db);
      } else {
        throw new CustomError(
          `Failed to create the database in the docker container! ${e.message}`,
          'PostgresInitFail',
        );
      }
    }
  }

  async addNetwork(genesis, config, { projectName }) {
    await this.createGenesis(genesis, genesis.networkSymbol);

    await this.writeConfig(config, { projectName });

    await this.createDatabase(config.components.dal.connection.database);

    await this.updateDeploy();
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
