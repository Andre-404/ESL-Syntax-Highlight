/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as vscode from 'vscode';
import {legend, DocumentSemanticTokensProvider} from './semanticTokenProvider';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient/node';

import {ESLService, ESLError} from './eslConnectionLayer'

let client: LanguageClient;
let terminal: vscode.Terminal;

export function activate(context: vscode.ExtensionContext) {
	// create a run esl program button
	const myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
	context.subscriptions.push(myStatusBarItem);
	myStatusBarItem.command = "esl.runThisFile";
	myStatusBarItem.text = "▶ Run this ESL program ◀";
	myStatusBarItem.show();

	terminal = vscode.window.terminals.find((terminal: vscode.Terminal) => terminal.name == "ESL Terminal");
	if(terminal == undefined) terminal = vscode.window.createTerminal("ESL Terminal", "cmd.exe");
	terminal.show();

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('LSP', 'out', 'server.js')
	);
	

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for .esl documents
		documentSelector: [{ scheme: 'file', language: 'esl' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc' files contained in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'eslLanguageServer',
		'ESL Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();

	// register command: runThisFile
	context.subscriptions.push(vscode.commands.registerCommand("esl.runThisFile", () => {
		const doc = vscode.window.activeTextEditor.document;
		const uri = doc.uri;
		terminal = vscode.window.terminals.find((terminal: vscode.Terminal) => terminal.name == "ESL Terminal");
		if(terminal == undefined) terminal = vscode.window.createTerminal("ESL Terminal", "cmd.exe");
		terminal.show();
		ESLService.runFile(uri.toString(), terminal);
	}));

	const collection = vscode.languages.createDiagnosticCollection('ESL Diagnostics');
	
	// Server checks if there are any errors in the code
	function sortDiagnostics(errors:ESLError[]) : Map<string, ESLError[]>{
		const diagnosticMap: Map<string, ESLError[]> = new Map();
		errors.forEach((error) => {
			if(diagnosticMap.get(error.path) == undefined) diagnosticMap.set(error.path, []);
			diagnosticMap.get(error.path).push(error);
			console.log(error);
		});
		return diagnosticMap;
	}
	client.onNotification("esl/updateDiagnostics", async (uri: string) => {
		const diagnostics = await ESLService.runCommand("-validate-file",uri, []);
		collection.clear();
		const map = sortDiagnostics(JSON.parse(diagnostics));
		const severityMap = {
			"error": vscode.DiagnosticSeverity.Error,
			"warning": vscode.DiagnosticSeverity.Warning,
			"information": vscode.DiagnosticSeverity.Information,
			"hint": vscode.DiagnosticSeverity.Hint
		}
		map.forEach((value:ESLError[], key: string) => {
			collection.set(vscode.Uri.file(key), value.map<vscode.Diagnostic>((value:ESLError) => {
				return {
					code: value.code,
					message: value.message,
					severity: severityMap[value.severity],
					range: new vscode.Range(new vscode.Position(value.line, value.start), new vscode.Position(value.line, value.end)),
					source: "ESL",
					relatedInformation: value.relatedInformation.map((related:any) =>{
						return {
							message: related.message,
							location: new vscode.Location(vscode.Uri.file(related.path), 
							new vscode.Range(
								new vscode.Position(related.line, related.start), 
								new vscode.Position(related.line, related.end)
							))
						};
					})
				};
			}));
		});
	});

	client.onNotification("esl/saveDocument", (uri:string) =>{
		let doc = vscode.workspace.textDocuments.find((value:vscode.TextDocument) => value.uri.toString() == uri);
		doc.save();
	});

	client.onNotification("esl/runThisFileFailed", (error) => {
		vscode.window.showErrorMessage(error);
	});
	context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'esl'}, new DocumentSemanticTokensProvider(), legend));
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
