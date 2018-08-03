process.title = 'Download Proxy Server';

const fs = require('fs');
const express = require('express');
const app = express();
const path = require('path');
const request = require('request');
const url = require('url');
const bodyParser = require('body-parser');

const listenPort = 4445;

const downloadStatus = {};

const MAX_SIZE = 3221225472; // 3GB
let lastResponse = null;
const newDownloadStatus = () => {
	downloadStatus.connection = 0; // -1 :Refuse, 0 : No, 1 : Downloading, 2 : Finished
	downloadStatus.totalSize = 0; // -1 : Unspecified
	downloadStatus.downSize  = 0; // use filesize function
	downloadStatus.name 		 = 'Untitled';
	downloadStatus.startTime = 0;
	downloadStatus.endTime = 0;
	lastResponse = null;
}


newDownloadStatus();

//let file = fs.createWriteStream(path.join(__dirname + '/download-latest'));
let file = path.join(__dirname + '/download-latest');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', (req, res) => {
	res.status(302).setHeader("Location", "./download");
  res.send('Hello World!');
});

app.get('/download' , (req, res) => {
	res.sendFile(path.join(__dirname + '/render/downloadForm.html'));
});

app.post('/download', (req, res) => {

	if (typeof req.body.url === 'undefined') return res.send('n0 url');

	if(downloadStatus.connection === 1){
		return res.send('<script>alert("already transfering now");location.href="./download";</script>');
	}

	newDownloadStatus();


	const streamFile = fs.createWriteStream(file);

	request.get({url: req.body.url, followAllRedirects: true })
	.on('response', (response) => {

		if (!(response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) ||
			(typeof response.headers['content-length'] !== 'undefined' && parseInt(response.headers['content-length']) > MAX_SIZE)
		){
			response.destroy();
			downloadStatus.connection = -1;
			return;
		}

		downloadStatus.connection = 1;
		downloadStatus.totalSize  = 
		(typeof response.headers['content-length'] !== 'undefined' && parseInt(response.headers['content-length']) > 0) ?
		parseInt(response.headers['content-length']) : -1;
		downloadStatus.startTime = new Date().getTime();	

		lastResponse = response;

		let filename,
        contentDisp = response.headers['content-disposition'];
    if (contentDisp && /^attachment/i.test(contentDisp)) {
        filename = contentDisp.toLowerCase()
            .split('filename=')[1]
            .split(';')[0]
            .replace(/"/g, '');
    } else {
        filename = path.basename(url.parse(req.body.url).path);
    }

		filename = filename.split('?')[0];

		downloadStatus.name = filename;

		response
		.on('data', (data) => {

			if (fs.statSync(file).size > MAX_SIZE){
				response.destroy();
				downloadStatus.connection = -1;
				return;
			}

			downloadStatus.downSize += data.length;
			downloadStatus.endTime = new Date().getTime();

		})
		.on('end', () => {
			downloadStatus.connection = 2;
			downloadStatus.downSize = fs.statSync(file).size;
			downloadStatus.totalSize = fs.statSync(file).size;
			downloadStatus.endTime = new Date().getTime();
		})
		.on('error', () => {
			downloadStatus.connection = -1;
		});

	})
	.pipe(streamFile);

	res.send('<script type="text/javascript">setTimeout(function(){ location.href = location.href; }, 1000);</script>');
});

app.get('/download-stream', (req, res) => {

	if (downloadStatus.totalSize < 0){
		res.setHeader('content-length', downloadStatus.totalSize);
	}
	res.setHeader('content-disposition', 'attachment; filename="' + downloadStatus.name + '"');
	fs.createReadStream(file).pipe(res);

});

app.get('/download-status', (req, res) => {

	res.send(JSON.stringify(downloadStatus));

});

app.get('/cancel', (req, res) => {
	
	if (lastResponse){
		lastResponse.destroy();
		newDownloadStatus();
	}

	res.send('<script>location.href="./download";</script>');

});

app.listen(listenPort, '127.0.0.1', function () {
  console.log(`listening on port ${listenPort}`);
});
