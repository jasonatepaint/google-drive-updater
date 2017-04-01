import { GoogleDriveClient } from '../src/gDriveClient';
import mocha from 'mocha';
import chai from 'chai';
let assert = chai.assert;

const UNIT_TEST_GDRIVE_FOLDER = "_tests";

describe('Google Drive Client', () => {
	let client = new GoogleDriveClient();

	before(() => {
		return client.authenticate();
	});

	it('works at all', () => {
		return client.getFolders().then((folders) => {
			assert.isAtLeast(folders.length, 1, "Should have at least one folder");
		})
	});
});