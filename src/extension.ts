import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';
import { FlinkSQLLexer } from './FlinkSQLLexer'; // 导入生成的词法分析器
import { FlinkSQLParser } from './FlinkSQLParser'; // 导入生成的解析器
import { ANTLRInputStream, CommonTokenStream } from 'antlr4ts';
import { MyFlinkSQLVisitor } from './Grammar'; 
import { FlinkSQLReferenceProvider } from './Reference'; 
import { FlinkSQLRenameProvider } from './Rename'; 
import { ParserErrorListener, RecognitionException, Recognizer } from 'antlr4ts';
const sqlFormatter = require('sql-formatter-plus');

interface Config {
    indent: string;
    language: string;
    uppercase: boolean;
    linesBetweenQueries: number;
}

const config: Config = {
    indent: ' '.repeat(2),
    language: 'fql',
    uppercase: true,
    linesBetweenQueries: 2,
};

const format = (text: string): string => {
    return sqlFormatter.format(text, config);
};

const selector = 'flink-sql'

export function activate(context: ExtensionContext) {

    // 获取初始配置
    updateFeatureStatus();

    context.subscriptions.push(vscode.languages.registerReferenceProvider(
        [{ pattern: '**/*.sql' }, { pattern: '**/*.fql' }],
        new FlinkSQLReferenceProvider()
    ));

    context.subscriptions.push(vscode.commands.registerCommand('extension.showReferences', (uri: vscode.Uri, position: vscode.Position, locations: vscode.Location[]) => {
        vscode.commands.executeCommand('editor.action.showReferences', uri, position, locations);
    }));

    // 监听配置更改事件
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('flink-sql-grammar-check.enable')) {
                updateFeatureStatus();
            }
        })
    );

    vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits: (
            document: vscode.TextDocument,
            range: vscode.Range,
            options: vscode.FormattingOptions
        ): vscode.TextEdit[] => [
                vscode.TextEdit.replace(range, format(document.getText(range))),
            ],
    });
    context.subscriptions.push(vscode.languages.registerRenameProvider(selector, new FlinkSQLRenameProvider()));

    // 注册插件的其他命令和功能...
}

function updateFeatureStatus() {

    if (vscode.workspace.getConfiguration('flink-sql-grammar-check').get('enable')) {
        // 创建诊断集合，用于报告语法错误和警告
        const diagnosticCollection = vscode.languages.createDiagnosticCollection(selector);

        // 保存时触发
        vscode.workspace.onDidSaveTextDocument((event: vscode.TextDocument) => {
            // 检查文件是否为Flink SQL文件
            if (event.languageId !== selector) {
                return;
            }
            // 清除之前的诊断信息
            diagnosticCollection.clear();

            // 使用生成的词法分析器和解析器进行语法检查
            const inputStream = new ANTLRInputStream(event.getText());
            const lexer = new FlinkSQLLexer(inputStream);
            const tokenStream = new CommonTokenStream(lexer);
            const parser = new FlinkSQLParser(tokenStream);
            parser.removeErrorListeners();
            parser.addErrorListener({
                syntaxError: (recognizer: Recognizer<any, any>, offendingSymbol: any, line: number, charPositionInLine: number, msg: string, e: RecognitionException | undefined): void => {
                    vscode.window.showErrorMessage("Parser flink sql error. line: " + line + " position: " + charPositionInLine + " msg: " + msg);
                },
            })
            parser.compileParseTreePattern
            // 解析文件内容并获取语法树
            const parseTree = parser.program();

            // 创建访问器实例并访问语法树，以获取语法错误和警告
            const visitor = new MyFlinkSQLVisitor();
            visitor.visit(parseTree);
            const errors = visitor.getErrors();
            errors.forEach(error => {
                vscode.window.showInformationMessage("Visitor flink sql error. error: " + error);
            })
        });
    }
}