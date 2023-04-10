import * as vscode from 'vscode'
// If vscode.Uri is used the whole program crashes for some arcane reason
import { URI } from 'vscode-uri'

export interface ESLError{
    path: string;
    code: number;
    message: string;
    line: number;
    start: number;
    end: number;
    severity: string;
    relatedInformation: Array<any>;
}

export class ESLService{
    private static singleton = new ESLService();
    private path;

    constructor(){
        const p = require("path");
        this.path = p.dirname(p.dirname(__dirname)) + "\\ESL";
    }

    public static runFile(filePath:string, terminal:vscode.Terminal){
        let path = URI.parse(filePath).path;
        path = path.substring(1, path.length);
		terminal.sendText(this.singleton.path + " " + path, true);
    }

    public static runCommand(command: string, filePath:string, args: string[]): Promise<any>{
        const { spawn } = require('child_process');
        let path = URI.parse(filePath).path;
        path = path.substring(1, path.length);
        return new Promise((resolve, reject) =>{
            const process = spawn(ESLService.singleton.path, [path, command].concat(args));
            process.stdout.on('data', (data) => {
                try {
                    resolve(data.toString());
                } catch (error) {
                    reject(error);
                }
            });
            process.stderr.on('data', (data) => {
                reject(data);
                console.log("Error encountered when analyzing ESL: " + data.toString());
            });
        });
    }
}