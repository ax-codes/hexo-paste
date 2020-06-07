/*
 * @Description:
 * @Author: ax
 * @Github: https://github.com/GuoXingGitHub
 * @Date: 2020-06-06 15:43:28
 * @LastEditors: ax
 * @LastEditTime: 2020-06-07 16:27:35
 */

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as moment from "moment";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import * as fse from "fs-extra";
import { v4 as uuidv4 } from "uuid";

class Logger {
  static channel: vscode.OutputChannel;

  static log(message: any) {
    if (this.channel) {
      let time = moment().format("MM-DD HH:mm:ss");
      this.channel.appendLine(`[${time}] ${message}`);
    }
  }

  static showInformationMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined> {
    this.log(message);
    return vscode.window.showInformationMessage(message, ...items);
  }

  static showErrorMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined> {
    this.log(message);
    return vscode.window.showErrorMessage(message, ...items);
  }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  Logger.channel = vscode.window.createOutputChannel("PasteImage");
  context.subscriptions.push(Logger.channel);
  Logger.log(
    'Congratulations, your extension "vscode-paste-image" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "extension.pasteImage",
    () => {
      // The code you place here will be executed every time your command is executed
      try {
        Paster.paste();
      } catch (error) {
        Logger.showErrorMessage(error);
      }
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

class Paster {
  private static editFileName: string;
  private static editFilePath: string;
  private static folderPath: string;
  private static projectPath: string;
  private static outImagePath: string;

  public static paste() {
    // get current edit file path
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    let fileUri = editor.document.uri;

    if (!fileUri) {
      return;
    }
    if (fileUri.scheme === "untitled") {
      Logger.showInformationMessage(
        "Before pasting the image, you need to save current file first."
      );
      return;
    }

    this.editFilePath = fileUri.fsPath;
    this.editFileName = path.basename(this.editFilePath, ".md");
    this.folderPath = path.dirname(this.editFilePath);
    this.projectPath = vscode.workspace.rootPath || "";

    //Logger.showInformationMessage('filePath:'+filePath);
    //Logger.showInformationMessage("folderPath:" + this.folderPath);
    //Logger.showInformationMessage('projectPath:'projectPath);

    //获取图片路径
    //检测文件路径是否存在
    //不存在创建
    //从剪切版生成文件
    //将code插入到markdown

    this.getImagePath(
      this.editFileName,
      this.folderPath,
      (imageFolderPath, imagePath, imageFolderName, imageName) => {
        if (!editor) {
          return;
        }
        this.saveAndPaste(
          editor,
          imageFolderPath,
          imagePath,
          imageFolderName,
          imageName
        );
      }
    );
  }

  //获取文件路径
  public static getImagePath(
    editFileName: string,
    folderPath: string,
    callback: (
      imageFolderPath: string,
      imagePath: string,
      imageFolderName: string,
      imageName: string
    ) => void
  ) {
    const timeVar = moment().format("YYYY-MM-DD");
    const imageName = uuidv4() + ".png";
    const imageFolderName = timeVar + "-" + editFileName;
    const imageFolderPath = path.join(folderPath, imageFolderName);
    const imagePath = path.join(folderPath, imageFolderName, imageName);
    callback(imageFolderPath, imagePath, imageFolderName, imageName);
  }

  //保存
  public static saveAndPaste(
    editor: vscode.TextEditor,
    imageFolderPath: string,
    imagePath: string,
    imageFolderName: string,
    imageName: string
  ) {
    this.initImageFolder(imageFolderPath)
      .then(() => {
        // save image and insert to current edit file
        this.saveClipboardImageToFileAndGetPath(
          imagePath,
          (imagePath, imagePathReturnByScript) => {
            if (!imagePathReturnByScript) {
              return;
            }
            if (imagePathReturnByScript === "no image") {
              Logger.showInformationMessage(
                "There is not an image in the clipboard."
              );
              return;
            }

            // editor.edit((edit) => {
            //   let current = editor.selection;
            //   if (current.isEmpty) {
            //     edit.insert(current.start, imagePath);
            //   } else {
            //     edit.replace(current, imagePath);
            //   }
            // });

            editor.edit((edit) => {
              let current = editor.selection;
              const insertTxt = `![${imageName.replace(
                ".png",
                ""
              )}](${imageName})`;
              edit.insert(current.start, insertTxt);
            });
          }
        );
      })
      .catch((error) => {
        Logger.showErrorMessage(
          `create '${imageFolderName}' folder faile;message:${error.message}`
        );
      });
  }

  //初始化图片存放文件夹
  private static initImageFolder(imageFolderPath: string) {
    return new Promise((resolve, reject) => {
      // With Promises and a mode integer:
      fse
        .ensureDir(imageFolderPath)
        .then(() => {
          resolve(imageFolderPath);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  //使用脚本从剪切板保存图片并获取图片路径
  private static saveClipboardImageToFileAndGetPath(
    imagePath: string,
    cb: (imagePath: string, imagePathFromScript: string) => void
  ) {
    if (!imagePath) {
      return;
    }

    let platform = process.platform;
    if (platform === "win32") {
      // Windows
      const scriptPath = path.join(__dirname, "../res/pc.ps1");

      let command =
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
      let powershellExisted = fs.existsSync(command);
      if (!powershellExisted) {
        command = "powershell";
      }

      const powershell = spawn(command, [
        "-noprofile",
        "-noninteractive",
        "-nologo",
        "-sta",
        "-executionpolicy",
        "unrestricted",
        "-windowstyle",
        "hidden",
        "-file",
        scriptPath,
        imagePath,
      ]);
      powershell.on("error", function (error) {
        if (error.code === "ENOENT") {
          Logger.showErrorMessage(
            `The powershell command is not in you PATH environment variables. Please add it and retry.`
          );
        } else {
          Logger.showErrorMessage(error.message);
        }
      });
      powershell.on("exit", function (code, signal) {
        // console.log('exit', code, signal);
      });
      powershell.stdout.on("data", function (data: Buffer) {
        cb(imagePath, data.toString().trim());
      });
    } else if (platform === "darwin") {
      // Mac
      let scriptPath = path.join(__dirname, "../res/mac.applescript");

      let ascript = spawn("osascript", [scriptPath, imagePath]);
      ascript.on("error", function (error) {
        Logger.showErrorMessage(error.message);
      });
      ascript.on("exit", function (code, signal) {
        // console.log("exit", code, signal);
      });
      ascript.stdout.on("data", function (data: Buffer) {
        cb(imagePath, data.toString().trim());
      });
    } else {
      // Linux

      let scriptPath = path.join(__dirname, "../res/linux.sh");

      let ascript = spawn("sh", [scriptPath, imagePath]);
      ascript.on("error", function (error) {
        Logger.showErrorMessage(error.message);
      });
      ascript.on("exit", function (code, signal) {
        // console.log('exit',code,signal);
      });
      ascript.stdout.on("data", function (data: Buffer) {
        let result = data.toString().trim();
        if (result === "no xclip") {
          Logger.showInformationMessage(
            "You need to install xclip command first."
          );
          return;
        }
        cb(imagePath, result);
      });
    }
  }
}
