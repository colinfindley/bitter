/**
 * jsPsych plugin for pavlovia.org
 *
 * This plugin handles communications with the pavlovia.org server: it opens and closes sessions, and uploads data
 * to the server.
 *
 * @author Alain Pitiot
 * @version 3.0.0
 * @copyright (c) 2019 Ilixa Ltd. ({@link http://ilixa.com})
 * @license Distributed under the terms of the MIT License
 */


jsPsych.plugins['pavlovia'] = (function() {

	/**
	 * The version number.
	 *
	 * @type {string}
	 * @public
	 */
	const version = '3.0.0';


	let plugin = {};


	/**
	 * The default error callback function.
	 *
	 * Error messages are displayed in the body of the document and in the browser's console.
	 *
	 * @param {Object} error - the error json object to be displayed.
	 * @public
	 */
	const defaultErrorCallback = function(error) {
		// output the error to the console:
		console.error('[pavlovia ' + version + ']', error);

		// output the error to the html body:
		let htmlCode = '<h3>[jspsych-pavlovia plugin ' + version + '] Error</h3><ul>';
		while (true) {
			if (typeof error === 'object' && 'context' in error) {
				htmlCode += '<li>' + error.context + '</li>';
				error = error.error;
			} else {
				htmlCode += '<li><b>' + error  + '</b></li>';
				break;
			}
		}
		htmlCode += '</ul>';
		document.querySelector('body').innerHTML = htmlCode;
	};


	/**
	 * Plugin information.
	 * @public
	 */
	plugin.info = {
		name: 'pavlovia',
		description: 'communication with pavlovia.org',
		parameters: {
			command: {
				type: jsPsych.plugins.parameterType.STRING,
				pretty_name: 'Command',
				default: 'init',
				description: 'The pavlovia command: "init" (default) or "finish"'
			},
			errorCallback: {
				type: jsPsych.plugins.parameterType.FUNCTION,
				pretty_name: 'ErrorCallback',
				default: defaultErrorCallback,
				description: 'The callback function called whenever an error has occurred'
			}
		}
	};


	/**
	 * Run the plugin.
	 *
	 * @param {HTMLElement} display_element - the HTML DOM element where jsPsych content is rendered
	 * @param {Object} trial - the jsPsych trial
	 * @public
	 */
	plugin.trial = function(display_element, trial) {

		// execute the command:
		switch (trial.command.toLowerCase()) {
			case 'init':
				_init(trial);
				break;

			case 'finish':
				let data = jsPsych.data.get().csv();
				_finish(trial, data);
				break;

			default:
				trial.errorCallback('unknown command: ' + trial.command);
		}


		// end trial
		jsPsych.finishTrial();
	};


	/**
	 * The pavlovia.org configuration (usually read from the config.json configuration file).
	 *
	 * @type {Object}
	 * @private
	 */
	let _config = {};


	/**
	 * Initialise the connection with pavlovia.org: configure the plugin and open a new session.
	 *
	 * @param {Object} trial - the jsPsych trial
	 * @param {string} [configURL= "config.json"] - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<void>}
	 * @private
	 */
	const _init = async function(trial, configURL = 'config.json') {
		try {
			// configure:
			let response = await _configure(configURL);
			_config = response.config;
			_log('init | configure.response=', response);

			// open a new session:
			response = await _openSession();
			_config.experiment.token = response.token;
			_log('init | openSession.response=', response);
		} catch (error) {
			trial.errorCallback(error);
		}
	};


	/**
	 * Finish the connection with pavlovia.org: upload the collected data and close the session.
	 *
	 * @param {Object} trial - the jsPsych trial
	 * @param {Object} data - the experiment data to be uploaded
	 * @returns {Promise<void>}
	 * @private
	 */
	const _finish = async function(trial, data) {
		try {
			// upload the data to pavlovia.org:
			const date = new Date();
			let dateString = date.getFullYear() + '-' + ('0'+(1+date.getMonth())).slice(-2) + '-' + ('0'+date.getDate()).slice(-2) + '_';
			dateString += ('0'+date.getHours()).slice(-2) + 'h' + ('0'+date.getMinutes()).slice(-2) + '.' + ('0'+date.getSeconds()).slice(-2) + '.' + date.getMilliseconds();

			const key = _config.experiment.name + '_' + 'PARTICIPANT' + '_' + 'SESSION' + '_' + dateString + '.csv';
			let response = await _uploadData(key, data);
			_log('finish | uploadData.response=', response);

			// close the session:
			response = await _closeSession();
			_log('finish | closeSession.response=', response);
		} catch (error) {
			trial.errorCallback(error);
		}
	};


	/**
	 * Configure the plugin by reading the configuration file created upon activation of the experiment.
	 *
	 * @param {string} [configURL= "config.json"] - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<void>}
	 * @private
	 */
	const _configure = async function(configURL) {
		let response = { origin: '_configure', context: 'when configuring the plugin' };

		try {
			const response = await _getConfiguration(configURL);

			if (!('psychoJsManager' in response.config)) response.config.psychoJsManager = { URL: "https://pavlovia.org/server" };

			// tests for the presence of essential blocks in the configuration:
			if (!('experiment' in response.config))
				throw 'missing experiment block in configuration';
			if (!('name' in response.config.experiment))
				throw 'missing name in experiment block in configuration';
			if (!('fullpath' in response.config.experiment))
				throw 'missing fullpath in experiment block in configuration';
			if (!('psychoJsManager' in response.config))
				throw 'missing psychoJsManager block in configuration';
			if (!('URL' in response.config.psychoJsManager))
				throw 'missing URL in psychoJsManager block in configuration';

			return response;
		}
		catch (error) {
			throw { ...response, error };
		}
	};


	/**
	 * Get the pavlovia.org json configuration file.
	 *
	 * @param {string} configURL - the URL of the pavlovia.org json configuration file
	 * @returns {Promise<any>}
	 * @private
	 */
	const _getConfiguration = function(configURL) {
		let response = { origin: '_getConfiguration', context: 'when reading the configuration file: ' + configURL };

		return new Promise((resolve, reject) => {
			$.get(configURL, 'json')
				.done((config, textStatus) => {
					resolve({ ...response, config });
				})
				.fail((jqXHR, textStatus, errorThrown) => {
					reject({ ...response, error: errorThrown });
				});
		});
	};


	/**
	 * Open a new session for this experiment on pavlovia.org.
	 *
	 * @returns {Promise<any>}
	 * @private
	 */
	const _openSession = function() {
		let response = { origin: '_openSession', context: 'when opening a session for experiment: ' + _config.experiment.name };

		return new Promise((resolve, reject) => {
			const data = {
				experimentFullPath: _config.experiment.fullpath
			};
			$.post(_config.psychoJsManager.URL + '?command=open_session', data, null, 'json')
				.done((data, textStatus) => {
					// check for error:
					if ('error' in data)
						reject({ ...response, error: data.error });

					// get session token:
					if ('token' in data)
						resolve({ ...response, token: data.token });
					else
						reject({ ...response, error: 'unexpected answer from server: no token' });
				})
				.fail((jqXHR, textStatus, errorThrown) => {
					reject({ ...response, error: 'request error: ' + textStatus });
				});
		});
	};


	/**
	 * Close the previously opened session on pavlovia.org.
	 *
	 * @returns {Promise<any>}
	 * @private
	 */
	const _closeSession = function() {
		let response = { origin: '_closeSession', context: 'when closing the session for experiment: ' + _config.experiment.name };

		return new Promise((resolve, reject) => {
			const data = {
				experimentFullPath: _config.experiment.fullpath,
				'token': _config.experiment.token
			};
			$.post(_config.psychoJsManager.URL + '?command=close_session', data, null, 'json')
				.done((data, textStatus) => {
					// check for error:
					if ('error' in data)
						reject({ ...response, error: data.error });

					resolve({ ...response, data });
				})
				.fail((jqXHR, textStatus, errorThrown) => {
					reject({ ...response, error: errorThrown });
				});
		});
	};


	/**
	 * Upload data (a key/value pair) to pavlovia.org.
	 *
	 * @param {string} key - the key
	 * @param {Object} value - the value
	 * @returns {Promise<any>}
	 * @private
	 */
	const _uploadData = function(key, value) {
		let response = { origin: '_uploadData', context: 'when uploading participant\' results for experiment: ' + _config.experiment.name };

		let data = {
			experimentFullPath: _config.experiment.fullpath,
			token: _config.experiment.token,
			key,
			value
		};

		// add gitlab ID of experiment if there is one:
		const gitlabConfig = _config.gitlab;
		if (typeof gitlabConfig !== 'undefined' && typeof gitlabConfig.projectId !== 'undefined')
			data.projectId = gitlabConfig.projectId;


		return new Promise((resolve, reject) => {
			$.post(_config.psychoJsManager.URL + '?command=save_data', data, null, 'json')
				.done((data, textStatus) => {
					// check for error:
					if ('error' in data)
						reject({ ...response, error: data.error });

					// return the response from the PsychoJS manager:
					resolve({ ...response, data });
				})
				.fail((jqXHR, textStatus, errorThrown) => {
					reject({ ...response, error: errorThrown });
				});
		});
	};


	/**
	 * Log messages to the browser's console.
	 *
	 * @param {...*} messages - the messages to be displayed in the browser's console
	 * @private
	 */
	const _log = function(...messages) {
		console.log('[pavlovia ' + version + ']', ...messages);
	};


	return plugin;
})();