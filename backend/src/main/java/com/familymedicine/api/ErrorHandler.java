package com.familymedicine.api;

import com.familymedicine.domain.RuleViolation;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice
public class ErrorHandler {
    @ExceptionHandler(com.familymedicine.prescription.StalePrescription.class)
    ResponseEntity<?> stalePrescription(com.familymedicine.prescription.StalePrescription e) {
        return ResponseEntity.status(409).body(Map.of("code",e.code(),"message",e.getMessage(),"currentVersion",e.currentVersion()));
    }
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<?> uploadTooLarge(Exception e) {
        return ResponseEntity.status(413).body(Map.of("code","UPLOAD_TOO_LARGE","message","Choose prescription files within the 10 MB upload limit."));
    }
    @ExceptionHandler(RuleViolation.class)
    ResponseEntity<?> domain(RuleViolation e) { return ResponseEntity.status(e.status()).body(Map.of("code",e.code(),"message",e.getMessage())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException e) {
        var fields=e.getBindingResult().getFieldErrors().stream().map(f->Map.of("field",f.getField(),"message",f.getDefaultMessage())).toList();
        return ResponseEntity.unprocessableEntity().body(Map.of("code","VALIDATION_FAILED","message","Check the highlighted fields","fields",fields));
    }
    @ExceptionHandler({MethodArgumentTypeMismatchException.class,HttpMessageNotReadableException.class})
    ResponseEntity<?> malformed(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code","INVALID_REQUEST","message","The request format is invalid"));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> duplicate(DataIntegrityViolationException e) {
        return ResponseEntity.status(409).body(Map.of("code","CONFLICT","message","The record changed or this action already exists. Refresh and review."));
    }
}
