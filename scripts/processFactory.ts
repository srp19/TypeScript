﻿/// <reference path="../src/compiler/sys.ts" />
module ts {
    interface Map<T> {
        [name: string]: T;
    }

    interface SyntaxNode {
        name?: string;
        kind?: string;
        type?: string;
        types?: string;
        baseType?: string;
        children?: SyntaxMember[];
    }

    interface SyntaxMember {
        paramName?: string;
        name?: string;
        type?: string;
        isNodeArray?: boolean;
        isModifiersArray?: boolean;
        optional?: string;
        converter?: string;
        visit?: string;
        readonly?: boolean;
    }

    var syntax: SyntaxNode[];
    var syntaxKindTable: Map<SyntaxNode>;
    var syntaxTypeTable: Map<SyntaxNode>;
    var syntaxSubTypesTable: Map<SyntaxNode[]>;
    var lastWriteSucceeded: boolean;

    var parts: string[] = [];
    var indentDepth: number = 0;
    var newlineRequested: boolean = false;
    var indentingSuspendedDepth: number = 0;
    var indentLevels: string[] = ["", "    "];

    function main(): void {
        if (sys.args.length < 1) {
            sys.write("Usage:" + sys.newLine);
            sys.write("\tnode processSyntax.js <syntax-json-input-file>" + sys.newLine);
            return;
        }

        var inputFilePath = sys.args[0].replace(/\\/g, "/");
        var inputStr = sys.readFile(inputFilePath);
        syntax = JSON.parse(inputStr);

        computeSyntaxTables();
        writeFile();

        var output = parts.join("");
        var inputDirectory = inputFilePath.substr(0, inputFilePath.lastIndexOf("/"));
        var outputPath = inputDirectory + "/factory.generated.ts";
        sys.writeFile(outputPath, output);
    }

    function computeSyntaxTables(): void {
        syntaxKindTable = {};
        syntaxTypeTable = {};
        syntaxSubTypesTable = {};
        for (var i = 0; i < syntax.length; i++) {
            var nodeType = syntax[i];
            var kind = nodeType.kind;
            var type = nodeType.type;
            var baseType = nodeType.baseType;
            var types = nodeType.types;
            var name = nodeType.name;

            if (kind) {
                nodeType.kind = kind.replace(/\s+/g, "");
                syntaxKindTable[nodeType.kind] = nodeType;
            }

            if (type) {
                nodeType.type = normalizeType(type);
                syntaxTypeTable[nodeType.type] = nodeType;
            }
            else {
                nodeType.type = normalizeType(nodeType.types || nodeType.baseType);
            }

            if (types) {
                nodeType.types = normalizeType(types);
            }

            if (baseType) {
                nodeType.baseType = normalizeType(baseType);
                var subTypes = getProperty(syntaxSubTypesTable, nodeType.baseType);
                if (!subTypes) {
                    subTypes = [];
                    syntaxSubTypesTable[nodeType.baseType] = subTypes;
                }
                subTypes.push(nodeType);
            }

            if (name) {
                nodeType.name = formatName(nodeType.name);
            }
            else {
                nodeType.name = formatName(nodeType.kind || nodeType.type);
            }

            var children = nodeType.children;
            if (children) {
                for (var j = 0; j < children.length; j++) {
                    var member = children[j];
                    member.type = normalizeType(member.type);
                    member.name = formatName(member.name);
                    if (!member.paramName) {
                        member.paramName = member.name;
                    }
                    else {
                        member.paramName = formatName(member.paramName);
                    }
                }
            }
        }
    }

    function writeFile(): void {

        writeln(`// <auto-generated />`);
        writeln(`/// <reference path="parser.ts"/>`);
        writeln(`/// <reference path="factory.ts"/>`);
        writeln();
        writeln(`module ts {`);
        indent();
        writeFactoryModule();
        writeVisitorModule();
        dedent();
        writeln(`}`);
        dedent();
    }

    function writeFactoryModule(): void {
        writeln(`export module Factory {`);
        indent();

        lastWriteSucceeded = false;
        for (var i = 0; i < syntax.length; i++) {
            var nodeType = syntax[i];
            writeCreateFunctionForNode(nodeType);
            writeUpdateFunctionForNode(nodeType);
        }

        dedent();
        writeln(`}`);
        writeln();
    }

    function writeCreateFunctionForNode(syntaxNode: SyntaxNode): void {
        if (!canCreate(syntaxNode)) {
            return;
        }

        if (lastWriteSucceeded) {
            writeln();
        }

        var kind = syntaxNode.kind;
        var type = syntaxNode.type || syntaxNode.baseType;
        var name = syntaxNode.name || kind || type;

        var modifiers: string;
        var children = syntaxNode.children;

        write(`export function create${syntaxNode.name}(`);

        if (children) {
            for (var i = 0; i < children.length; i++) {
                var member = children[i];
                write(member.paramName);
                if (member.optional) {
                    write(`?`);
                }

                write(`: ${member.type}`);

                if (member.isModifiersArray) {
                    modifiers = member.paramName;
                }
                if (member.isNodeArray || member.isModifiersArray) {
                    write(`[]`);
                }

                write(`, `);
            }
        }

        write(`location?: TextRange, flags?: NodeFlags`);

        writeln(`): ${syntaxNode.type} {`);
        indent();
        writeln(`var node = beginNode<${syntaxNode.type}>(SyntaxKind.${syntaxNode.kind});`);

        if (children) {
            for (var i = 0; i < children.length; i++) {
                var member = children[i];
                var paramName = member.paramName || member.name;

                write(`node.${member.name} = `);

                if (member.converter) {
                    write(`${member.converter}(`);
                }
                else if (member.isNodeArray) {
                    write(`createNodeArray(`);
                }
                else if (member.isModifiersArray) {
                    write(`<ModifiersArray>`);
                }

                write(paramName);

                if (member.converter || member.isNodeArray) {
                    write(`)`);
                }

                writeln(`;`);
            }
        }

        write(`return finishNode(node, location, flags`);

        if (modifiers) {
            write(`, ${modifiers}`);
        }

        writeln(`);`);
        dedent();
        writeln(`}`);

        lastWriteSucceeded = true;
    }

    function writeUpdateFunctionForNode(syntaxNode: SyntaxNode): void {
        if (!canUpdate(syntaxNode)) {
            return;
        }

        if (lastWriteSucceeded) {
            writeln();
        }

        write(`export function update${syntaxNode.name}(node: ${syntaxNode.type}`);

        var children = syntaxNode.children;
        for (var i = 0; i < children.length; i++) {
            var member = children[i];
            if (member.readonly) {
                continue;
            }

            write(`, `);
            write(member.paramName || member.name);
            write(`: ${member.type}`);
            if (member.isNodeArray || member.isModifiersArray) {
                write(`[]`);
            }
        }

        writeln(`): ${syntaxNode.type} {`);
        indent();
        write(`if (`);

        lastWriteSucceeded = false;
        for (var i = 0; i < children.length; i++) {
            var member = children[i];
            if (member.readonly) {
                continue;
            }

            if (lastWriteSucceeded) {
                write(` || `);
            }

            var paramName = member.paramName || member.name;
            write(`node.${member.name} !== ${member.paramName}`);
            lastWriteSucceeded = true;
        }

        writeln(`) {`);
        indent();
        write(`return create${syntaxNode.name}(`);

        for (var i = 0; i < children.length; i++) {
            var member = children[i];
            if (member.readonly) {
                write(`node.${member.name}`);
            }
            else {
                var paramName = member.paramName || member.name;
                write(paramName);
            }
            write(`, `);
        }

        writeln(`node, node.flags);`);
        dedent();
        writeln(`}`);
        writeln(`return node;`);
        dedent();
        writeln(`}`);
        lastWriteSucceeded = true;
    }

    function writeVisitorModule(): void {
        writeln(`export module Visitor {`);
        indent();
        writeFallbackFunction();
        writeAcceptFunction();
        dedent();
        writeln(`}`);
    }

    function writeFallbackFunction(): void {
        writeln(`export function fallback<TNode extends Node>(node: TNode, cbNode: Visitor, state?: any): TNode {`);
        indent();
        writeln(`if (!cbNode || !node) {`);
        indent();
        writeln(`return node;`);
        dedent();
        writeln(`}`);
        writeln(`return <TNode>accept(node, cbNode, state);`);
        dedent();
        writeln(`}`);
        writeln();
    }

    function writeAcceptFunction(): void {
        writeln(`function accept(node: Node, cbNode: Visitor, state?: any): Node {`);
        indent();

        writeln(`switch (node.kind) {`);
        indent();

        var returnNodeIsPending = false;
        for (var i = 0; i < syntax.length; i++) {
            var syntaxNode = syntax[i];
            if (!canCreate(syntaxNode)) {
                continue;
            }

            // combine runs of non-updatable nodes
            var hasUpdate = canUpdate(syntaxNode);
            if (!hasUpdate) {
                returnNodeIsPending = true;
            }
            else if (returnNodeIsPending) {
                returnNodeIsPending = false;
                indent();
                writeln(`return node;`);
                dedent();
            }

            // write case
            writeln(`case SyntaxKind.${syntaxNode.kind}:`);

            // if updatable, write update and recursive visit
            if (hasUpdate) {
                indent();
                writeUpdateNode(syntaxNode);
                dedent();
            }
        }

        if (returnNodeIsPending) {
            indent();
            writeln(`return node;`);
            dedent();
        }

        dedent();
        writeln(`}`);

        dedent();
        writeln(`}`);
    }

    function writeUpdateNode(syntaxNode: SyntaxNode): void {
        writeln(`return Factory.update${syntaxNode.name}(`);
        indent();
        write(`<${syntaxNode.type}>node`);

        var children = syntaxNode.children;
        if (children) {
            for (var i = 0; i < children.length; i++) {
                var member = children[i];
                if (member.readonly) {
                    continue;
                }
                writeln(`,`);
                writeVisitMember(syntaxNode, member);
            }
        }

        writeln(`);`);
        dedent();
    }

    function writeVisitMember(syntaxNode: SyntaxNode, member: SyntaxMember): void {
        var memberSyntaxNode = getProperty(syntaxTypeTable, member.type);
        if (memberSyntaxNode) {
            if (member.isNodeArray) {
                write(`visitNodes<${member.type}>(`);
            }
            else {
                write(`visit<${member.type}>(`);
            }
        }
        write(`(<${syntaxNode.type}>node).${member.name}`);
        if (memberSyntaxNode) {
            write(`, cbNode, state)`);
        }
    }

    function normalizeType(type: string): string {
        if (type) {
            type = type.replace(/\s+/g, "");
            if (isUnionType(type)) {
                var types = splitUnionType(type);
                types.sort();
                type = types.join("|");
            }
        }

        return formatType(type);
    }

    function isUnionType(type: string): boolean {
        return type && type.indexOf('|') !== -1;
    }

    function splitUnionType(type: string): string[] {
        if (!type) {
            return [];
        }
        return type.split(/\|/g).sort();
    }

    function formatName(type: string): string {
        if (!type) {
            return;
        }
        return type.replace(/\s*\|\s*/g, "Or");
    }

    function formatType(type: string): string {
        if (!type) {
            return;
        }
        return type.replace(/\s*\|\s*/g, " | ");
    }

    function canCreate(syntaxNode: SyntaxNode): boolean {
        return !!syntaxNode.kind;
    }

    function canUpdate(syntaxNode: SyntaxNode): boolean {
        if (canCreate(syntaxNode)) {
            var children = syntaxNode.children;
            if (children) {
                for (var i = 0; i < children.length; i++) {
                    var member = children[i];
                    if (!member.readonly) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function hasProperty<T>(map: Map<T>, key: string): boolean {
        if (map) {
            return Object.prototype.hasOwnProperty.call(map, key);
        }
    }

    function getProperty<T>(map: Map<T>, key: string): T {
        if (map && hasProperty(map, key)) {
            return map[key];
        }
    }

    function write(text: string): void {
        if (text) {
            var lines = text.split(/\r\n|\r|\n/g);
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (i > 0) {
                    newlineRequested = true;
                }

                tryWriteNewline();
                parts.push(line);
            }
        }
    }

    function writeln(text?: string): void {
        if (text) {
            write(text);
        }
        else if (newlineRequested) {
            writeNewline();
        }

        newlineRequested = true;
    }

    function indent(): void {
        indentDepth++;
    }

    function dedent(): void {
        indentDepth = Math.max(0, indentDepth - 1);
    }

    function suspendIndenting(): void {
        indentingSuspendedDepth++;
    }

    function resumeIndenting(): void {
        indentingSuspendedDepth = Math.max(0, indentingSuspendedDepth - 1);
    }

    function tryWriteIndent(): string {
        if (indentingSuspendedDepth || !indentDepth) {
            return;
        }
        var indent = getIndent(indentDepth);
        parts.push(indent);
    }

    function tryWriteNewline(): void {
        if (!newlineRequested) {
            return;
        }
        newlineRequested = false;
        writeNewline();
        tryWriteIndent();
    }

    function writeNewline(): void {
        parts.push(sys.newLine);
    }

    function getIndent(level: number): string {
        if (level in indentLevels) {
            return indentLevels[level];
        }
        var indent = getIndent(level - 1) + indentLevels[1];
        indentLevels[level] = indent;
        return indent;
    }

    main();
}